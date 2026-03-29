// @ts-nocheck
import type { Request, Response } from "express";
import { env } from "../../config/env";
import { upstreamGatewayService } from "../../services/proxy/upstream-gateway-service";
import { authService } from "../../services/public/auth-service";
import { xtreamRewriteService } from "../../services/proxy/xtream-rewrite-service";
import { getClientIp, getDeviceId } from "../../utils/request-context";

function getCredentials(req: Request) {
  return {
    username: (req.query.username?.toString() || req.params.username || "").toString(),
    password: (req.query.password?.toString() || req.params.password || "").toString(),
  };
}

export class XtreamController {
  async playerApi(req: Request, res: Response) {
    const { username, password } = getCredentials(req);
    const { user } = await authService.authenticate({
      username,
      password,
      ipAddress: getClientIp(req),
      userAgent: req.header("user-agent"),
      deviceId: getDeviceId(req),
    });

    const action = req.query.action?.toString();
    const credentials = await upstreamGatewayService.resolveCredentials(user);
    const rewrite = (payload: any) =>
      xtreamRewriteService.rewritePayload(payload, {
        user,
        publicUsername: username,
        publicPassword: password,
        upstreamUsername: credentials.username,
        upstreamPassword: credentials.password,
        upstreamBaseUrl: credentials.apiBaseUrl,
      });

    if (!action) {
      const payload = await upstreamGatewayService.getPlayerApi(user);
      return res.json(
        xtreamRewriteService.rewritePlayerApi(payload, {
          user,
          publicUsername: username,
          publicPassword: password,
          upstreamUsername: credentials.username,
          upstreamPassword: credentials.password,
          upstreamBaseUrl: credentials.apiBaseUrl,
        }),
      );
    }

    if (action === "get_live_categories") {
      return res.json(rewrite(await upstreamGatewayService.getLiveCategories(user)));
    }

    if (action === "get_vod_categories") {
      return res.json(rewrite(await upstreamGatewayService.getVodCategories(user)));
    }

    if (action === "get_series_categories") {
      return res.json(rewrite(await upstreamGatewayService.getSeriesCategories(user)));
    }

    if (action === "get_live_streams") {
      return res.json(
        rewrite(await upstreamGatewayService.getLiveStreams(user, req.query.category_id?.toString())),
      );
    }

    if (action === "get_vod_streams") {
      return res.json(
        rewrite(await upstreamGatewayService.getVodStreams(user, req.query.category_id?.toString())),
      );
    }

    if (action === "get_series") {
      return res.json(rewrite(await upstreamGatewayService.getSeries(user, req.query.category_id?.toString())));
    }

    if (action === "get_series_info") {
      return res.json(rewrite(await upstreamGatewayService.getSeriesInfo(user, req.query.series_id?.toString() || "")));
    }

    if (action === "get_vod_info") {
      return res.json(rewrite(await upstreamGatewayService.getVodInfo(user, req.query.vod_id?.toString() || "")));
    }

    // Passthrough: proxy any unhandled action directly to upstream
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== "username" && key !== "password" && value) {
        params[key] = value.toString();
      }
    }
    const passthroughData = await upstreamGatewayService.callPlayerApi(user, params);
    return res.json(rewrite(passthroughData));
  }

  async playlist(req: Request, res: Response) {
    const { username, password } = getCredentials(req);
    const output = req.query.output?.toString() || "ts";

    const { user } = await authService.authenticate({
      username,
      password,
      ipAddress: getClientIp(req),
      userAgent: req.header("user-agent"),
      deviceId: getDeviceId(req),
    });

    res.type("application/x-mpegURL");
    const credentials = await upstreamGatewayService.resolveCredentials(user);
    const playlist = await upstreamGatewayService.getPlaylist(user, output);
    return res.send(
      xtreamRewriteService.rewritePlaylist(playlist, {
        user,
        publicUsername: username,
        publicPassword: password,
        upstreamUsername: credentials.username,
        upstreamPassword: credentials.password,
        output,
        upstreamBaseUrl: credentials.playlistBaseUrl,
      }),
    );
  }

  async xmltv(req: Request, res: Response) {
    const { username, password } = getCredentials(req);

    const { user } = await authService.authenticate({
      username,
      password,
      ipAddress: getClientIp(req),
      userAgent: req.header("user-agent"),
      deviceId: getDeviceId(req),
    });

    res.type("application/xml");
    return res.send(await upstreamGatewayService.getXmltv(user));
  }

  async stream(req: Request, res: Response) {
    const { username, password } = getCredentials(req);
    const streamType = req.params.streamType as "live" | "movie" | "series";
    const streamId = req.params.streamId;
    const extension = req.params.extension;

    const { user } = await authService.authenticate({
      username,
      password,
      ipAddress: getClientIp(req),
      userAgent: req.header("user-agent"),
      deviceId: getDeviceId(req),
      streamType,
      streamId,
    });

    if (env.STREAM_MODE === "redirect") {
      const upstreamUrl = await upstreamGatewayService.buildStreamUrl(user, streamType, streamId, extension);
      return res.redirect(302, upstreamUrl);
    }

    const upstreamResponse = await upstreamGatewayService.proxyStream(
      user,
      streamType,
      streamId,
      extension,
      req.header("range"),
    );

    const passthroughHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "last-modified",
      "etag",
      "cache-control",
    ];

    for (const header of passthroughHeaders) {
      const value = upstreamResponse.headers[header];
      if (value) {
        res.setHeader(header, value);
      }
    }

    res.status(upstreamResponse.status);
    upstreamResponse.data.pipe(res);
  }
}

export const xtreamController = new XtreamController();
