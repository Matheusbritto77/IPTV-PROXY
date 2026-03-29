package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"math/rand"
)

var userAgents = []string{
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
	"Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/109.0.0.0",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0",
	"Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
	"Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Vivaldi/6.6.3271.57",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/109.0.0.0",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
}

func getRandomUserAgent() string {
	return userAgents[rand.Intn(len(userAgents))]
}

var errClientDisconnected = errors.New("client_disconnected")

type Config struct {
	Port                     int
	AppUpstreamOrigin        string
	EdgeSharedSecret         string
	AppBaseURL               string
	UpstreamTimeout          time.Duration
	DrainTTL                 time.Duration
	ReconnectDelay           time.Duration
	LiveReadChunkBytes       int
	RingBufferChunks         int
	RingBufferBytes          int
	MaxSubscriberBufferBytes int64
}

type StreamType string

const (
	StreamTypeLive   StreamType = "live"
	StreamTypeMovie  StreamType = "movie"
	StreamTypeSeries StreamType = "series"
)

type StreamContext struct {
	Key           string     `json:"key"`
	UpstreamID    string     `json:"upstreamId"`
	StreamType    StreamType `json:"streamType"`
	StreamID      string     `json:"streamId"`
	Extension     string     `json:"extension"`
	URLCandidates []string   `json:"urlCandidates"`
}

type RelayApp struct {
	config         Config
	logger         *log.Logger
	appClient      *http.Client
	upstreamClient *http.Client
	registry       *LiveChannelRegistry
}

type RelayMetrics struct {
	Status    string      `json:"status"`
	LiveRelay RegistryDTO `json:"liveRelay"`
	Timestamp string      `json:"timestamp"`
}

type RegistryDTO struct {
	ActiveChannels   int                `json:"activeChannels"`
	TotalSubscribers int                `json:"totalSubscribers"`
	Items            []WorkerMetricsDTO `json:"items"`
}

type WorkerMetricsDTO struct {
	Key                  string  `json:"key"`
	StreamID             string  `json:"streamId"`
	Extension            string  `json:"extension"`
	State                string  `json:"state"`
	Subscribers          int     `json:"subscribers"`
	StartedAt            string  `json:"startedAt"`
	LastSubscriberLeftAt *string `json:"lastSubscriberLeftAt"`
	UptimeMs             int64   `json:"uptimeMs"`
	BytesBroadcast       int64   `json:"bytesBroadcast"`
	ChunksBroadcast      int64   `json:"chunksBroadcast"`
	ReconnectCount       int64   `json:"reconnectCount"`
	RingBufferChunks     int     `json:"ringBufferChunks"`
	RingBufferBytes      int     `json:"ringBufferBytes"`
	LastError            string  `json:"lastError"`
}

func main() {
	rand.Seed(time.Now().UnixNano())
	config := loadConfig()
	logger := log.New(os.Stdout, "", 0)

	upstreamTransport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		MaxIdleConns:          2048,
		MaxIdleConnsPerHost:   512,
		MaxConnsPerHost:       0,
		IdleConnTimeout:       90 * time.Second,
		ResponseHeaderTimeout: config.UpstreamTimeout,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ForceAttemptHTTP2:     true,
	}

	appClient := &http.Client{
		Timeout: 15 * time.Second,
	}

	upstreamClient := &http.Client{
		Transport: upstreamTransport,
	}

	app := &RelayApp{
		config:         config,
		logger:         logger,
		appClient:      appClient,
		upstreamClient: upstreamClient,
	}
	app.registry = NewLiveChannelRegistry(app)

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", app.handleHealthz)
	mux.HandleFunc("/metrics", app.handleMetrics)
	mux.HandleFunc("/internal/edge/relay", app.handleRelay)

	server := &http.Server{
		Addr:              fmt.Sprintf("0.0.0.0:%d", config.Port),
		Handler:           mux,
		ReadHeaderTimeout: 15 * time.Second,
	}

	go func() {
		app.log("info", "stream_relay_started", map[string]any{
			"port": config.Port,
			"host": "0.0.0.0",
		})

		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			app.log("error", "stream_relay_server_failed", map[string]any{
				"error": err.Error(),
			})
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	app.registry.Shutdown()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
}

func loadConfig() Config {
	return Config{
		Port:                     intEnv("STREAM_RELAY_PORT", 8081),
		AppUpstreamOrigin:        stringEnv("APP_UPSTREAM_ORIGIN", "http://app:8080"),
		EdgeSharedSecret:         stringEnv("EDGE_SHARED_SECRET", "change-me-edge-secret"),
		AppBaseURL:               stringEnv("APP_BASE_URL", "http://localhost:8090"),
		UpstreamTimeout:          time.Duration(intEnv("UPSTREAM_TIMEOUT_MS", 8000)) * time.Millisecond,
		DrainTTL:                 time.Duration(intEnv("LIVE_CHANNEL_DRAIN_TTL_MS", 15000)) * time.Millisecond,
		ReconnectDelay:           time.Duration(intEnv("LIVE_CHANNEL_RECONNECT_DELAY_MS", 1000)) * time.Millisecond,
		LiveReadChunkBytes:       intEnv("LIVE_CHANNEL_READ_CHUNK_BYTES", 1024),
		RingBufferChunks:         intEnv("LIVE_CHANNEL_RING_BUFFER_CHUNKS", 32),
		RingBufferBytes:          intEnv("LIVE_CHANNEL_RING_BUFFER_BYTES", 262144),
		MaxSubscriberBufferBytes: int64(intEnv("LIVE_CHANNEL_MAX_SUBSCRIBER_BUFFER_BYTES", 524288)),
	}
}

func (app *RelayApp) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("ok"))
}

func (app *RelayApp) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(RelayMetrics{
		Status:    "ok",
		LiveRelay: app.registry.GetMetrics(),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

func (app *RelayApp) handleRelay(w http.ResponseWriter, r *http.Request) {
	responseWriter := &trackedResponseWriter{ResponseWriter: w}

	if r.Header.Get("x-edge-secret") != app.config.EdgeSharedSecret {
		writeJSONError(responseWriter, http.StatusUnauthorized, "unauthorized_edge")
		return
	}

	streamType, err := requiredHeader(r, "x-stream-type")
	if err != nil {
		writeJSONError(responseWriter, http.StatusBadRequest, "missing_edge_header")
		return
	}

	streamID, err := requiredHeader(r, "x-stream-id")
	if err != nil {
		writeJSONError(responseWriter, http.StatusBadRequest, "missing_edge_header")
		return
	}

	extension, err := requiredHeader(r, "x-stream-extension")
	if err != nil {
		writeJSONError(responseWriter, http.StatusBadRequest, "missing_edge_header")
		return
	}

	ctx, statusCode, err := app.fetchStreamContext(r.Context(), r)
	if err != nil {
		writeJSONError(responseWriter, statusCode, err.Error())
		return
	}

	if streamType == string(StreamTypeLive) {
		if rangeHeader := r.Header.Get("Range"); rangeHeader != "" {
			app.log("info", "live_range_header_ignored_for_worker", map[string]any{
				"key":       ctx.Key,
				"streamId":  streamID,
				"extension": extension,
				"range":     rangeHeader,
				"ifRange":   r.Header.Get("If-Range"),
			})
		}

		if err := app.registry.Subscribe(ctx, responseWriter, r); err != nil {
			if errors.Is(err, errClientDisconnected) || errors.Is(r.Context().Err(), context.Canceled) {
				app.log("info", "live_channel_client_disconnected", map[string]any{
					"key":      ctx.Key,
					"streamId": streamID,
				})
				return
			}

			app.log("error", "live_channel_subscribe_failed", map[string]any{
				"key":      ctx.Key,
				"streamId": streamID,
				"error":    err.Error(),
			})
			if !responseWriter.wroteHeader {
				writeJSONError(responseWriter, http.StatusBadGateway, "upstream_stream_failed")
			}
		}
		return
	}

	if err := app.proxyOneShot(r.Context(), ctx, responseWriter, r); err != nil {
		if errors.Is(err, errClientDisconnected) || errors.Is(r.Context().Err(), context.Canceled) {
			app.log("info", "stream_proxy_client_disconnected", map[string]any{
				"key":        ctx.Key,
				"streamId":   streamID,
				"streamType": streamType,
				"extension":  extension,
			})
			return
		}

		app.log("error", "stream_proxy_failed", map[string]any{
			"key":        ctx.Key,
			"streamId":   streamID,
			"streamType": streamType,
			"extension":  extension,
			"error":      err.Error(),
		})
		if !responseWriter.wroteHeader {
			writeJSONError(responseWriter, http.StatusBadGateway, "upstream_stream_failed")
		}
	}
}

func (app *RelayApp) fetchStreamContext(ctx context.Context, r *http.Request) (StreamContext, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, app.config.AppUpstreamOrigin+"/internal/edge/stream-context", nil)
	if err != nil {
		return StreamContext{}, http.StatusBadGateway, err
	}

	req.Header.Set("x-edge-secret", app.config.EdgeSharedSecret)
	req.Header.Set("x-edge-user-id", r.Header.Get("x-edge-user-id"))
	req.Header.Set("x-stream-type", r.Header.Get("x-stream-type"))
	req.Header.Set("x-stream-id", r.Header.Get("x-stream-id"))
	req.Header.Set("x-stream-extension", r.Header.Get("x-stream-extension"))
	if forwardedFor := r.Header.Get("x-forwarded-for"); forwardedFor != "" {
		req.Header.Set("x-forwarded-for", forwardedFor)
	}
	if userAgent := r.Header.Get("user-agent"); userAgent != "" {
		req.Header.Set("user-agent", userAgent)
	}

	response, err := app.appClient.Do(req)
	if err != nil {
		return StreamContext{}, http.StatusBadGateway, err
	}
	defer response.Body.Close()

	if response.StatusCode >= 400 {
		return StreamContext{}, response.StatusCode, fmt.Errorf("stream_context_failed")
	}

	var payload StreamContext
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return StreamContext{}, http.StatusBadGateway, err
	}

	if len(payload.URLCandidates) == 0 {
		return StreamContext{}, http.StatusBadGateway, fmt.Errorf("missing_url_candidates")
	}

	return payload, 0, nil
}

func (app *RelayApp) proxyOneShot(ctx context.Context, streamContext StreamContext, w http.ResponseWriter, r *http.Request) error {
	var lastStatus int
	for _, candidate := range streamContext.URLCandidates {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, candidate, nil)
		if err != nil {
			lastStatus = http.StatusBadGateway
			continue
		}

		app.decorateUpstreamRequest(req, r)
		startedAt := time.Now()
		response, err := app.upstreamClient.Do(req)
		if err != nil {
			lastStatus = http.StatusBadGateway
			continue
		}

		if response.StatusCode >= 400 {
			lastStatus = response.StatusCode
			_ = response.Body.Close()
			continue
		}

		defer response.Body.Close()
		copyPassthroughHeaders(w.Header(), response.Header)
		w.WriteHeader(response.StatusCode)

		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}

		_, copyErr := io.CopyBuffer(w, response.Body, make([]byte, 64*1024))
		if copyErr != nil {
			if errors.Is(copyErr, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
				return errClientDisconnected
			}
			return copyErr
		}

		app.log("info", "stream_proxy_completed", map[string]any{
			"key":        streamContext.Key,
			"streamId":   streamContext.StreamID,
			"streamType": streamContext.StreamType,
			"url":        candidate,
			"status":     response.StatusCode,
			"ttfbMs":     time.Since(startedAt).Milliseconds(),
		})
		return nil
	}

	if lastStatus == 0 {
		lastStatus = http.StatusBadGateway
	}
	return fmt.Errorf("upstream_stream_failed_%d", lastStatus)
}

func (app *RelayApp) openUpstreamPull(ctx context.Context, streamContext StreamContext) (*http.Response, string, error) {
	var lastStatus int
	for _, candidate := range streamContext.URLCandidates {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, candidate, nil)
		if err != nil {
			lastStatus = http.StatusBadGateway
			continue
		}

		app.decorateUpstreamRequest(req, nil)
		startedAt := time.Now()
		response, err := app.upstreamClient.Do(req)
		if err != nil {
			lastStatus = http.StatusBadGateway
			continue
		}

		if response.StatusCode >= 400 {
			lastStatus = response.StatusCode
			_ = response.Body.Close()
			continue
		}

		app.log("info", "live_channel_pull_connected", map[string]any{
			"key":      streamContext.Key,
			"streamId": streamContext.StreamID,
			"url":      candidate,
			"status":   response.StatusCode,
			"ttfbMs":   time.Since(startedAt).Milliseconds(),
		})
		return response, candidate, nil
	}

	if lastStatus == 0 {
		lastStatus = http.StatusBadGateway
	}
	return nil, "", fmt.Errorf("upstream_stream_failed_%d", lastStatus)
}

func (app *RelayApp) decorateUpstreamRequest(req *http.Request, original *http.Request) {
	req.Header.Set("User-Agent", getRandomUserAgent())
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Accept-Language", "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7")
	req.Header.Set("Connection", "close")
	req.Header.Set("Referer", app.config.AppBaseURL)

	if original == nil {
		return
	}

	if rangeHeader := original.Header.Get("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}
	if ifRange := original.Header.Get("If-Range"); ifRange != "" {
		req.Header.Set("If-Range", ifRange)
	}
}

func (app *RelayApp) log(level string, msg string, fields map[string]any) {
	payload := map[string]any{
		"level": level,
		"time":  time.Now().UnixMilli(),
		"msg":   msg,
	}
	for key, value := range fields {
		payload[key] = value
	}
	encoded, _ := json.Marshal(payload)
	app.logger.Println(string(encoded))
}

type LiveChannelRegistry struct {
	app     *RelayApp
	mu      sync.Mutex
	workers map[string]*LiveChannelWorker
}

func NewLiveChannelRegistry(app *RelayApp) *LiveChannelRegistry {
	return &LiveChannelRegistry{
		app:     app,
		workers: make(map[string]*LiveChannelWorker),
	}
}

func (registry *LiveChannelRegistry) HasWorker(key string) bool {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	_, ok := registry.workers[key]
	return ok
}

func (registry *LiveChannelRegistry) Subscribe(streamContext StreamContext, w http.ResponseWriter, r *http.Request) error {
	registry.mu.Lock()
	worker := registry.workers[streamContext.Key]
	if worker == nil {
		worker = NewLiveChannelWorker(registry.app, streamContext, func(key string) {
			registry.mu.Lock()
			defer registry.mu.Unlock()
			delete(registry.workers, key)
		})
		registry.workers[streamContext.Key] = worker
	}
	registry.mu.Unlock()

	return worker.AddSubscriber(w, r)
}

func (registry *LiveChannelRegistry) GetMetrics() RegistryDTO {
	registry.mu.Lock()
	workers := make([]*LiveChannelWorker, 0, len(registry.workers))
	for _, worker := range registry.workers {
		workers = append(workers, worker)
	}
	registry.mu.Unlock()

	items := make([]WorkerMetricsDTO, 0, len(workers))
	totalSubscribers := 0
	for _, worker := range workers {
		metrics := worker.GetMetrics()
		totalSubscribers += metrics.Subscribers
		items = append(items, metrics)
	}

	return RegistryDTO{
		ActiveChannels:   len(items),
		TotalSubscribers: totalSubscribers,
		Items:            items,
	}
}

func (registry *LiveChannelRegistry) Shutdown() {
	registry.mu.Lock()
	workers := make([]*LiveChannelWorker, 0, len(registry.workers))
	for _, worker := range registry.workers {
		workers = append(workers, worker)
	}
	registry.workers = map[string]*LiveChannelWorker{}
	registry.mu.Unlock()

	for _, worker := range workers {
		worker.Shutdown("registry_shutdown")
	}
}

type LiveChannelWorker struct {
	app          *RelayApp
	streamCtx    StreamContext
	onTerminated func(string)

	mu                   sync.Mutex
	subscribers          map[string]*Subscriber
	ringBuffer           [][]byte
	ringBufferBytes      int
	upstreamBody         io.ReadCloser
	upstreamStatus       int
	upstreamHeaders      http.Header
	state                string
	stopped              bool
	startedAt            time.Time
	lastSubscriberLeftAt *time.Time
	bytesBroadcast       int64
	chunksBroadcast      int64
	reconnectCount       int64
	lastError            string
	connectCh            chan struct{}
	connectErr           error
	drainTimer           *time.Timer
	reconnectTimer       *time.Timer
}

type Subscriber struct {
	id           string
	writer       http.ResponseWriter
	flusher      http.Flusher
	done         chan struct{}
	doneOnce     sync.Once
	requestCtx   context.Context
	connectedAt  time.Time
	initialized  bool
	notify       chan struct{}
	mu           sync.Mutex
	pending      [][]byte
	pendingBytes int64
	closed       bool
}

type trackedResponseWriter struct {
	http.ResponseWriter
	wroteHeader bool
}

func (writer *trackedResponseWriter) WriteHeader(statusCode int) {
	writer.wroteHeader = true
	writer.ResponseWriter.WriteHeader(statusCode)
}

func (writer *trackedResponseWriter) Write(payload []byte) (int, error) {
	writer.wroteHeader = true
	return writer.ResponseWriter.Write(payload)
}

func (writer *trackedResponseWriter) Flush() {
	if flusher, ok := writer.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func NewLiveChannelWorker(app *RelayApp, streamContext StreamContext, onTerminated func(string)) *LiveChannelWorker {
	return &LiveChannelWorker{
		app:          app,
		streamCtx:    streamContext,
		onTerminated: onTerminated,
		subscribers:  make(map[string]*Subscriber),
		ringBuffer:   make([][]byte, 0, app.config.RingBufferChunks),
		startedAt:    time.Now(),
		state:        "idle",
	}
}

func (worker *LiveChannelWorker) AddSubscriber(w http.ResponseWriter, r *http.Request) error {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return fmt.Errorf("streaming_not_supported")
	}

	subscriber := &Subscriber{
		id:          newID(),
		writer:      w,
		flusher:     flusher,
		done:        make(chan struct{}),
		requestCtx:  r.Context(),
		connectedAt: time.Now(),
		notify:      make(chan struct{}, 1),
	}

	worker.mu.Lock()
	if worker.stopped {
		worker.mu.Unlock()
		return fmt.Errorf("worker_stopped")
	}
	worker.cancelDrainLocked()
	worker.subscribers[subscriber.id] = subscriber
	worker.mu.Unlock()

	go func() {
		<-r.Context().Done()
		worker.removeSubscriber(subscriber.id)
	}()

	if err := worker.ensureConnected(); err != nil {
		worker.removeSubscriber(subscriber.id)
		return err
	}

	worker.initializeSubscriber(subscriber)

	select {
	case <-subscriber.done:
	case <-r.Context().Done():
	}

	return nil
}

func (worker *LiveChannelWorker) ensureConnected() error {
	for {
		worker.mu.Lock()
		if worker.stopped {
			worker.mu.Unlock()
			return fmt.Errorf("worker_stopped")
		}

		if worker.state == "live" && worker.upstreamBody != nil {
			worker.mu.Unlock()
			return nil
		}

		if worker.connectCh != nil {
			waitCh := worker.connectCh
			worker.mu.Unlock()
			<-waitCh
			continue
		}

		worker.connectCh = make(chan struct{})
		worker.state = "connecting"
		worker.mu.Unlock()

		worker.app.log("info", "live_channel_worker_connecting", map[string]any{
			"key":         worker.streamCtx.Key,
			"streamId":    worker.streamCtx.StreamID,
			"subscribers": worker.subscriberCount(),
		})

		resp, _, err := worker.app.openUpstreamPull(context.Background(), worker.streamCtx)

		worker.mu.Lock()
		waitCh := worker.connectCh
		worker.connectCh = nil
		if err != nil {
			worker.state = "failed"
			worker.lastError = err.Error()
			worker.connectErr = err
			close(waitCh)
			worker.mu.Unlock()
			return err
		}

		worker.upstreamBody = resp.Body
		worker.upstreamStatus = resp.StatusCode
		worker.upstreamHeaders = resp.Header.Clone()
		worker.ringBuffer = make([][]byte, 0, worker.app.config.RingBufferChunks)
		worker.ringBufferBytes = 0
		worker.state = "live"
		worker.lastError = ""
		worker.connectErr = nil
		close(waitCh)
		worker.mu.Unlock()

		go worker.readLoop(resp.Body)

		worker.app.log("info", "live_channel_worker_live", map[string]any{
			"key":         worker.streamCtx.Key,
			"streamId":    worker.streamCtx.StreamID,
			"subscribers": worker.subscriberCount(),
		})
		return nil
	}
}

func (worker *LiveChannelWorker) initializeSubscriber(subscriber *Subscriber) {
	worker.mu.Lock()
	current, ok := worker.subscribers[subscriber.id]
	if !ok || current != subscriber || subscriber.initialized {
		worker.mu.Unlock()
		return
	}

	status := worker.upstreamStatus
	headers := worker.upstreamHeaders.Clone()
	seededPending := subscriber.seedPending(worker.ringBuffer, worker.app.config.MaxSubscriberBufferBytes)
	subscriber.initialized = true
	worker.mu.Unlock()

	go worker.runSubscriber(subscriber, status, headers)
	if seededPending {
		subscriber.signal()
	}
}

func (worker *LiveChannelWorker) runSubscriber(subscriber *Subscriber, status int, headers http.Header) {
	defer subscriber.doneOnce.Do(func() {
		close(subscriber.done)
	})

	sanitizeLiveSubscriberHeaders(headers)
	copyPassthroughHeaders(subscriber.writer.Header(), headers)
	subscriber.writer.WriteHeader(status)
	subscriber.flusher.Flush()

	for {
		select {
		case <-subscriber.done:
			return
		case <-subscriber.requestCtx.Done():
			worker.removeSubscriber(subscriber.id)
			return
		case <-subscriber.notify:
			for {
				chunk, ok := subscriber.takeNextChunk()
				if !ok {
					break
				}

				if err := writeChunk(subscriber.writer, subscriber.flusher, chunk); err != nil {
					worker.removeSubscriber(subscriber.id)
					return
				}
			}
		}
	}
}

func (worker *LiveChannelWorker) readLoop(body io.ReadCloser) {
	defer body.Close()

	chunkSize := worker.app.config.LiveReadChunkBytes
	if chunkSize <= 0 {
		chunkSize = 1024
	}

	buffer := make([]byte, chunkSize)
	for {
		n, err := body.Read(buffer)
		if n > 0 {
			worker.broadcastBuffer(buffer[:n], chunkSize)
		}

		if err != nil {
			if errors.Is(err, io.EOF) {
				worker.handleUpstreamTermination("upstream_end", nil)
				return
			}
			worker.handleUpstreamTermination("upstream_error", err)
			return
		}
	}
}

func (worker *LiveChannelWorker) broadcastBuffer(buffer []byte, preferredChunkSize int) {
	chunkSize := preferredChunkSize
	if chunkSize <= 0 {
		chunkSize = 1024
	}

	for start := 0; start < len(buffer); start += chunkSize {
		end := start + chunkSize
		if end > len(buffer) {
			end = len(buffer)
		}

		chunk := append([]byte(nil), buffer[start:end]...)
		worker.broadcastChunk(chunk)
	}
}

func (worker *LiveChannelWorker) broadcastChunk(chunk []byte) {
	worker.mu.Lock()
	if worker.stopped {
		worker.mu.Unlock()
		return
	}

	worker.bytesBroadcast += int64(len(chunk))
	worker.chunksBroadcast++
	worker.appendToRingBufferLocked(chunk)

	type slowSubscriber struct {
		id            string
		bufferedBytes int64
	}

	slowSubscribers := make([]slowSubscriber, 0)

	for _, subscriber := range worker.subscribers {
		if !subscriber.initialized {
			continue
		}

		if bufferedBytes, overloaded := subscriber.enqueueChunk(chunk, worker.app.config.MaxSubscriberBufferBytes); overloaded {
			slowSubscribers = append(slowSubscribers, slowSubscriber{
				id:            subscriber.id,
				bufferedBytes: bufferedBytes,
			})
		}
	}
	worker.mu.Unlock()

	for _, slow := range slowSubscribers {
		worker.app.log("warn", "live_channel_subscriber_buffer_exceeded", map[string]any{
			"key":                      worker.streamCtx.Key,
			"streamId":                 worker.streamCtx.StreamID,
			"subscriberId":             slow.id,
			"bufferedBytes":            slow.bufferedBytes,
			"maxSubscriberBufferBytes": worker.app.config.MaxSubscriberBufferBytes,
		})
		worker.removeSubscriber(slow.id)
	}
}

func (worker *LiveChannelWorker) removeSubscriber(subscriberID string) {
	worker.mu.Lock()
	subscriber, ok := worker.subscribers[subscriberID]
	if !ok {
		worker.mu.Unlock()
		return
	}

	delete(worker.subscribers, subscriberID)
	subscriber.close()
	subscriber.doneOnce.Do(func() {
		close(subscriber.done)
	})

	if len(worker.subscribers) == 0 {
		now := time.Now()
		worker.lastSubscriberLeftAt = &now
		worker.cancelReconnectLocked()
		worker.scheduleDrainLocked()
	}
	worker.mu.Unlock()
}

func (worker *LiveChannelWorker) scheduleDrainLocked() {
	if worker.drainTimer != nil || worker.stopped {
		return
	}

	worker.state = "draining"
	worker.drainTimer = time.AfterFunc(worker.app.config.DrainTTL, func() {
		worker.mu.Lock()
		worker.drainTimer = nil
		if worker.stopped || len(worker.subscribers) > 0 {
			worker.mu.Unlock()
			return
		}
		worker.mu.Unlock()

		worker.app.log("info", "live_channel_worker_drained", map[string]any{
			"key":        worker.streamCtx.Key,
			"streamId":   worker.streamCtx.StreamID,
			"drainTtlMs": worker.app.config.DrainTTL.Milliseconds(),
		})

		worker.Shutdown("drain_ttl_elapsed")
	})
}

func (worker *LiveChannelWorker) cancelDrainLocked() {
	if worker.drainTimer == nil {
		return
	}

	worker.drainTimer.Stop()
	worker.drainTimer = nil
	if worker.upstreamBody != nil && !worker.stopped {
		worker.state = "live"
	}
}

func (worker *LiveChannelWorker) scheduleReconnectLocked() {
	if worker.reconnectTimer != nil || worker.stopped || len(worker.subscribers) == 0 {
		return
	}

	worker.state = "connecting"
	worker.reconnectTimer = time.AfterFunc(worker.app.config.ReconnectDelay, func() {
		worker.mu.Lock()
		worker.reconnectTimer = nil
		worker.reconnectCount++
		worker.mu.Unlock()

		if err := worker.ensureConnected(); err != nil {
			worker.app.log("warn", "live_channel_worker_reconnect_failed", map[string]any{
				"key":            worker.streamCtx.Key,
				"streamId":       worker.streamCtx.StreamID,
				"error":          err.Error(),
				"reconnectCount": worker.reconnectCount,
			})
			worker.mu.Lock()
			worker.scheduleReconnectLocked()
			worker.mu.Unlock()
		}
	})
}

func (worker *LiveChannelWorker) cancelReconnectLocked() {
	if worker.reconnectTimer == nil {
		return
	}
	worker.reconnectTimer.Stop()
	worker.reconnectTimer = nil
}

func (worker *LiveChannelWorker) handleUpstreamTermination(reason string, err error) {
	worker.mu.Lock()
	if worker.upstreamBody != nil {
		worker.upstreamBody = nil
	}

	if worker.stopped {
		worker.mu.Unlock()
		return
	}

	worker.state = "failed"
	if err != nil {
		worker.lastError = err.Error()
	} else {
		worker.lastError = reason
	}

	subscribers := len(worker.subscribers)
	shouldReconnect := reason != "upstream_end"
	if shouldReconnect {
		worker.scheduleReconnectLocked()
	}
	if subscribers == 0 {
		worker.scheduleDrainLocked()
	}
	worker.mu.Unlock()

	worker.app.log("warn", "live_channel_worker_upstream_terminated", map[string]any{
		"key":         worker.streamCtx.Key,
		"streamId":    worker.streamCtx.StreamID,
		"reason":      reason,
		"error":       errorString(err),
		"subscribers": subscribers,
	})

	if !shouldReconnect {
		worker.Shutdown("upstream_end")
	}
}

func (worker *LiveChannelWorker) Shutdown(reason string) {
	worker.mu.Lock()
	if worker.stopped {
		worker.mu.Unlock()
		return
	}

	worker.stopped = true
	worker.state = "failed"
	worker.lastError = reason
	if worker.drainTimer != nil {
		worker.drainTimer.Stop()
		worker.drainTimer = nil
	}
	if worker.reconnectTimer != nil {
		worker.reconnectTimer.Stop()
		worker.reconnectTimer = nil
	}
	body := worker.upstreamBody
	worker.upstreamBody = nil
	subscribers := make([]*Subscriber, 0, len(worker.subscribers))
	for _, subscriber := range worker.subscribers {
		subscribers = append(subscribers, subscriber)
	}
	worker.subscribers = map[string]*Subscriber{}
	worker.mu.Unlock()

	if body != nil {
		_ = body.Close()
	}
	for _, subscriber := range subscribers {
		subscriber.close()
		subscriber.doneOnce.Do(func() {
			close(subscriber.done)
		})
	}
	worker.onTerminated(worker.streamCtx.Key)
}

func (worker *LiveChannelWorker) GetMetrics() WorkerMetricsDTO {
	worker.mu.Lock()
	defer worker.mu.Unlock()

	var lastSubscriberLeftAt *string
	if worker.lastSubscriberLeftAt != nil {
		value := worker.lastSubscriberLeftAt.UTC().Format(time.RFC3339)
		lastSubscriberLeftAt = &value
	}

	return WorkerMetricsDTO{
		Key:                  worker.streamCtx.Key,
		StreamID:             worker.streamCtx.StreamID,
		Extension:            worker.streamCtx.Extension,
		State:                worker.state,
		Subscribers:          len(worker.subscribers),
		StartedAt:            worker.startedAt.UTC().Format(time.RFC3339),
		LastSubscriberLeftAt: lastSubscriberLeftAt,
		UptimeMs:             time.Since(worker.startedAt).Milliseconds(),
		BytesBroadcast:       worker.bytesBroadcast,
		ChunksBroadcast:      worker.chunksBroadcast,
		ReconnectCount:       worker.reconnectCount,
		RingBufferChunks:     len(worker.ringBuffer),
		RingBufferBytes:      worker.ringBufferBytes,
		LastError:            worker.lastError,
	}
}

func (worker *LiveChannelWorker) appendToRingBufferLocked(chunk []byte) {
	worker.ringBuffer = append(worker.ringBuffer, chunk)
	worker.ringBufferBytes += len(chunk)

	for len(worker.ringBuffer) > worker.app.config.RingBufferChunks || worker.ringBufferBytes > worker.app.config.RingBufferBytes {
		if len(worker.ringBuffer) == 0 {
			break
		}
		removed := worker.ringBuffer[0]
		worker.ringBuffer = worker.ringBuffer[1:]
		worker.ringBufferBytes -= len(removed)
	}
}

func (worker *LiveChannelWorker) subscriberCount() int {
	worker.mu.Lock()
	defer worker.mu.Unlock()
	return len(worker.subscribers)
}

func (subscriber *Subscriber) seedPending(chunks [][]byte, maxBytes int64) bool {
	subscriber.mu.Lock()
	defer subscriber.mu.Unlock()

	if subscriber.closed || len(chunks) == 0 {
		return false
	}

	start := 0
	if maxBytes > 0 {
		var total int64
		start = len(chunks)
		for index := len(chunks) - 1; index >= 0; index-- {
			size := int64(len(chunks[index]))
			if total+size > maxBytes {
				break
			}
			total += size
			start = index
		}
	}

	for _, chunk := range chunks[start:] {
		subscriber.pending = append(subscriber.pending, chunk)
		subscriber.pendingBytes += int64(len(chunk))
	}

	return len(subscriber.pending) > 0
}

func (subscriber *Subscriber) enqueueChunk(chunk []byte, maxBytes int64) (int64, bool) {
	subscriber.mu.Lock()
	defer subscriber.mu.Unlock()

	if subscriber.closed {
		return subscriber.pendingBytes, false
	}

	nextBytes := subscriber.pendingBytes + int64(len(chunk))
	if maxBytes > 0 && nextBytes > maxBytes {
		return subscriber.pendingBytes, true
	}

	subscriber.pending = append(subscriber.pending, chunk)
	subscriber.pendingBytes = nextBytes
	select {
	case subscriber.notify <- struct{}{}:
	default:
	}
	return nextBytes, false
}

func (subscriber *Subscriber) takeNextChunk() ([]byte, bool) {
	subscriber.mu.Lock()
	defer subscriber.mu.Unlock()

	if subscriber.closed || len(subscriber.pending) == 0 {
		return nil, false
	}

	chunk := subscriber.pending[0]
	subscriber.pending[0] = nil
	subscriber.pending = subscriber.pending[1:]
	subscriber.pendingBytes -= int64(len(chunk))
	if subscriber.pendingBytes < 0 {
		subscriber.pendingBytes = 0
	}
	return chunk, true
}

func (subscriber *Subscriber) close() {
	subscriber.mu.Lock()
	defer subscriber.mu.Unlock()
	subscriber.closed = true
	subscriber.pending = nil
	subscriber.pendingBytes = 0
}

func (subscriber *Subscriber) signal() {
	select {
	case subscriber.notify <- struct{}{}:
	default:
	}
}

func copyPassthroughHeaders(target http.Header, source http.Header) {
	for _, header := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Last-Modified", "ETag", "Cache-Control"} {
		values := source.Values(header)
		for _, value := range values {
			target.Add(header, value)
		}
	}
}

func writeChunk(w http.ResponseWriter, flusher http.Flusher, chunk []byte) error {
	if _, err := w.Write(chunk); err != nil {
		return err
	}
	flusher.Flush()
	return nil
}

func sanitizeLiveSubscriberHeaders(headers http.Header) {
	headers.Del("Content-Length")
	headers.Del("Content-Range")
	headers.Del("Accept-Ranges")
}

func requiredHeader(r *http.Request, name string) (string, error) {
	value := strings.TrimSpace(r.Header.Get(name))
	if value == "" {
		return "", fmt.Errorf("missing_%s", name)
	}
	return value, nil
}

func writeJSONError(w http.ResponseWriter, status int, code string) {
	if tracked, ok := w.(*trackedResponseWriter); ok && tracked.wroteHeader {
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code})
}

func stringEnv(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func intEnv(key string, fallback int) int {
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

func newID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func errorString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
