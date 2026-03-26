package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type relayConfig struct {
	port                    string
	edgeSecret              string
	maxIdleConns            int
	maxIdleConnsPerHost     int
	maxConnsPerHost         int
	idleConnTimeout         time.Duration
	responseHeaderTimeout   time.Duration
	tlsHandshakeTimeout     time.Duration
}

func envString(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func envDurationMS(key string, fallback int) time.Duration {
	return time.Duration(envInt(key, fallback)) * time.Millisecond
}

func writeJSONError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code})
}

func firstHeader(r *http.Request, name string) string {
	return strings.TrimSpace(r.Header.Get(name))
}

func distinct(values ...string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}

		if _, ok := seen[value]; ok {
			continue
		}

		seen[value] = struct{}{}
		out = append(out, strings.TrimRight(value, "/"))
	}

	return out
}

func buildStreamURLs(baseURL, username, password, streamType, streamID, extension string) []string {
	switch streamType {
	case "live":
		urls := []string{
			fmt.Sprintf("%s/%s/%s/%s/%s.%s", baseURL, streamType, username, password, streamID, extension),
		}
		if extension != "m3u8" {
			urls = append(urls, fmt.Sprintf("%s/%s/%s/%s/%s.m3u8", baseURL, streamType, username, password, streamID))
		}
		if extension != "ts" {
			urls = append(urls, fmt.Sprintf("%s/%s/%s/%s/%s.ts", baseURL, streamType, username, password, streamID))
		}
		urls = append(urls, fmt.Sprintf("%s/%s/%s/%s", baseURL, username, password, streamID))
		return distinct(urls...)
	case "movie", "series":
		urls := []string{
			fmt.Sprintf("%s/%s/%s/%s/%s.%s", baseURL, streamType, username, password, streamID, extension),
		}
		if extension != "m3u8" {
			urls = append(urls, fmt.Sprintf("%s/%s/%s/%s/%s.m3u8", baseURL, streamType, username, password, streamID))
		}
		if extension != "mp4" {
			urls = append(urls, fmt.Sprintf("%s/%s/%s/%s/%s.mp4", baseURL, streamType, username, password, streamID))
		}
		return distinct(urls...)
	default:
		return nil
	}
}

func buildCandidateURLs(primaryBase, fallbackBase, username, password, streamType, streamID, extension string) []string {
	candidates := []string{}
	for _, baseURL := range distinct(primaryBase, fallbackBase) {
		candidates = append(candidates, buildStreamURLs(baseURL, username, password, streamType, streamID, extension)...)
	}

	return distinct(candidates...)
}

func proxyRelay(client *http.Client, w http.ResponseWriter, r *http.Request) {
	if firstHeader(r, "X-Edge-Secret") != envString("EDGE_SHARED_SECRET", "change-me-edge-secret") {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized_edge")
		return
	}

	streamType := firstHeader(r, "X-Stream-Type")
	streamID := firstHeader(r, "X-Stream-Id")
	extension := firstHeader(r, "X-Stream-Extension")
	username := firstHeader(r, "X-Edge-Upstream-Username")
	password := firstHeader(r, "X-Edge-Upstream-Password")
	primaryBase := firstHeader(r, "X-Edge-Upstream-Primary-Base")
	fallbackBase := firstHeader(r, "X-Edge-Upstream-Fallback-Base")

	if streamType == "" || streamID == "" || extension == "" || username == "" || password == "" || primaryBase == "" {
		writeJSONError(w, http.StatusBadRequest, "missing_edge_header")
		return
	}

	var lastStatus int
	var lastErr error

	for _, candidateURL := range buildCandidateURLs(primaryBase, fallbackBase, username, password, streamType, streamID, extension) {
		startedAt := time.Now()
		req, err := http.NewRequest(http.MethodGet, candidateURL, nil)
		if err != nil {
			lastErr = err
			continue
		}

		if rangeHeader := firstHeader(r, "Range"); rangeHeader != "" {
			req.Header.Set("Range", rangeHeader)
		}
		if ifRange := firstHeader(r, "If-Range"); ifRange != "" {
			req.Header.Set("If-Range", ifRange)
		}
		req.Header.Set("User-Agent", "P2PStreamRelay/1.0")
		req.Header.Set("Connection", "keep-alive")

		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		if resp.StatusCode >= 400 {
			lastStatus = resp.StatusCode
			_ = resp.Body.Close()
			continue
		}

		log.Printf(
			`{"msg":"relay_upstream_success","streamType":"%s","streamId":"%s","candidateUrl":"%s","status":%d,"ttfbMs":%.2f}`,
			streamType,
			streamID,
			candidateURL,
			resp.StatusCode,
			float64(time.Since(startedAt).Microseconds())/1000.0,
		)

		for _, header := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Last-Modified", "ETag", "Cache-Control"} {
			if value := resp.Header.Get(header); value != "" {
				w.Header().Set(header, value)
			}
		}

		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
		_ = resp.Body.Close()
		return
	}

	if lastErr != nil {
		log.Printf(
			`{"msg":"relay_upstream_error","streamType":"%s","streamId":"%s","error":%q}`,
			streamType,
			streamID,
			lastErr.Error(),
		)
		writeJSONError(w, http.StatusBadGateway, "upstream_stream_failed")
		return
	}

	if lastStatus == 0 {
		lastStatus = http.StatusBadGateway
	}

	log.Printf(
		`{"msg":"relay_upstream_status_failed","streamType":"%s","streamId":"%s","status":%d}`,
		streamType,
		streamID,
		lastStatus,
	)
	writeJSONError(w, http.StatusBadGateway, "upstream_stream_failed")
}

func main() {
	cfg := relayConfig{
		port:                  envString("STREAM_RELAY_PORT", "8081"),
		edgeSecret:            envString("EDGE_SHARED_SECRET", "change-me-edge-secret"),
		maxIdleConns:          envInt("STREAM_RELAY_MAX_IDLE_CONNS", 512),
		maxIdleConnsPerHost:   envInt("STREAM_RELAY_MAX_IDLE_CONNS_PER_HOST", 256),
		maxConnsPerHost:       envInt("STREAM_RELAY_MAX_CONNS_PER_HOST", 256),
		idleConnTimeout:       envDurationMS("STREAM_RELAY_IDLE_CONN_TIMEOUT_MS", 90000),
		responseHeaderTimeout: envDurationMS("STREAM_RELAY_RESPONSE_HEADER_TIMEOUT_MS", 10000),
		tlsHandshakeTimeout:   envDurationMS("STREAM_RELAY_TLS_HANDSHAKE_TIMEOUT_MS", 5000),
	}

	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		MaxIdleConns:          cfg.maxIdleConns,
		MaxIdleConnsPerHost:   cfg.maxIdleConnsPerHost,
		MaxConnsPerHost:       cfg.maxConnsPerHost,
		IdleConnTimeout:       cfg.idleConnTimeout,
		ResponseHeaderTimeout: cfg.responseHeaderTimeout,
		TLSHandshakeTimeout:   cfg.tlsHandshakeTimeout,
		ForceAttemptHTTP2:     true,
		TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12},
	}

	client := &http.Client{Transport: transport}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/internal/edge/relay", func(w http.ResponseWriter, r *http.Request) {
		proxyRelay(client, w, r)
	})

	server := &http.Server{
		Addr:              "0.0.0.0:" + cfg.port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf(`{"msg":"go_stream_relay_started","port":"%s"}`, cfg.port)

	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
		<-stop

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf(`{"msg":"go_stream_relay_failed","error":%q}`, err.Error())
	}
}
