// @ts-nocheck
import type { Request, Response } from "express";
import { env } from "../../config/env";
import { upstreamGatewayService } from "../../services/proxy/upstream-gateway-service";
import { authService } from "../../services/public/auth-service";
import { epgService } from "../../services/public/epg-service";
import { portalResponseBuilder } from "../../services/public/portal-response-builder";
import { getClientIp, getDeviceId } from "../../utils/request-context";
import { HttpError } from "../../utils/http-error";

function getPortalCredentials(req: Request) {
  return {
    username: (req.query.login?.toString() || req.query.username?.toString() || "").toString(),
    password: (req.query.password?.toString() || "").toString(),
  };
}

function getMac(req: Request) {
  return (
    req.header("x-mac-address") ||
    req.header("authorization")?.replace(/^Bearer\s+/i, "") ||
    req.query.mac?.toString() ||
    getDeviceId(req) ||
    "00:00:00:00:00:00"
  );
}

export class PortalController {
  async handle(req: Request, res: Response) {
    const action = req.query.action?.toString() || "handshake";
    const type = req.query.type?.toString() || "stb";

    if (type !== "stb" && type !== "itv") {
      throw new HttpError(400, "unsupported_portal_type");
    }

    if (action === "handshake") {
      return res.json(portalResponseBuilder.buildHandshake(crypto.randomUUID()));
    }

    const { username, password } = getPortalCredentials(req);
    const { user } = await authService.authenticate({
      username,
      password,
      ipAddress: getClientIp(req),
      userAgent: req.header("user-agent"),
      deviceId: getMac(req),
    });

    if (action === "get_profile") {
      return res.json(portalResponseBuilder.buildProfile(user, getMac(req)));
    }

    if (action === "get_main_info") {
      return res.json(portalResponseBuilder.buildMainInfo(user));
    }

    if (action === "get_genres") {
      const categories = await upstreamGatewayService.getLiveCategories(user);
      return res.json(portalResponseBuilder.buildGenres(Array.isArray(categories) ? categories : []));
    }

    if (action === "get_categories") {
      const categoryType = req.query.category_type?.toString() || "vod";
      if (categoryType === "vod") {
        const categories = await upstreamGatewayService.getVodCategories(user);
        return res.json(portalResponseBuilder.buildVodCategories(Array.isArray(categories) ? categories : []));
      }

      if (categoryType === "series") {
        const categories = await upstreamGatewayService.getSeriesCategories(user);
        return res.json(portalResponseBuilder.buildSeriesCategories(Array.isArray(categories) ? categories : []));
      }
    }

    if (action === "get_all_channels") {
      const channels = await upstreamGatewayService.getLiveStreams(user);
      return res.json(
        portalResponseBuilder.buildChannels(
          env.APP_BASE_URL,
          username,
          password,
          Array.isArray(channels) ? channels : [],
        ),
      );
    }

    if (action === "get_ordered_list") {
      const contentType = req.query.genre?.toString() === "series" ? "series" : req.query.type?.toString();
      const page = Number(req.query.p?.toString() || "1");
      const pageSize = Number(req.query.page_size?.toString() || "50");

      if (contentType === "vod") {
        const items = await upstreamGatewayService.getVodStreams(user, req.query.category?.toString());
        const paginated = Array.isArray(items) ? items.slice((page - 1) * pageSize, page * pageSize) : [];
        return res.json(
          portalResponseBuilder.buildVodItems(
            env.APP_BASE_URL,
            username,
            password,
            paginated,
          ),
        );
      }

      if (contentType === "series") {
        const items = await upstreamGatewayService.getSeries(user, req.query.category?.toString());
        const paginated = Array.isArray(items) ? items.slice((page - 1) * pageSize, page * pageSize) : [];
        return res.json(portalResponseBuilder.buildSeriesItems(paginated));
      }
    }

    if (action === "get_short_epg") {
      const xmltv = await upstreamGatewayService.getXmltv(user);
      const channelId = req.query.ch_id?.toString() || req.query.stream_id?.toString() || "";
      const limit = Number(req.query.size?.toString() || "10");
      return res.json(portalResponseBuilder.buildEpg(epgService.getShortEpg(xmltv, channelId, limit)));
    }

    if (action === "get_epg_info") {
      const xmltv = await upstreamGatewayService.getXmltv(user);
      const channelId = req.query.ch_id?.toString() || req.query.stream_id?.toString() || "";
      const from = req.query.from?.toString() ? Number(req.query.from) : undefined;
      const to = req.query.to?.toString() ? Number(req.query.to) : undefined;
      return res.json(portalResponseBuilder.buildEpg(epgService.getEpgInfo(xmltv, channelId, from, to)));
    }

    if (action === "get_series_info") {
      const seriesId = req.query.movie_id?.toString() || req.query.series_id?.toString() || "";
      const payload = await upstreamGatewayService.getSeriesInfo(user, seriesId);
      return res.json(portalResponseBuilder.buildSeriesInfo(env.APP_BASE_URL, username, password, payload));
    }

    if (action === "get_vod_info") {
      const vodId = req.query.movie_id?.toString() || req.query.vod_id?.toString() || "";
      const payload = await upstreamGatewayService.getVodInfo(user, vodId);
      return res.json(portalResponseBuilder.buildVodInfo(env.APP_BASE_URL, username, password, payload, vodId));
    }

    if (action === "create_link") {
      const cmd = req.query.cmd?.toString() || "";
      const streamIdMatch = cmd.match(/(\d+)(?:\.\w+)?$/);
      const streamId = streamIdMatch?.[1];
      if (!streamId) {
        throw new HttpError(400, "invalid_cmd");
      }

      return res.json(portalResponseBuilder.buildCreateLink(env.APP_BASE_URL, username, password, streamId));
    }

    return res.status(400).json({ error: "unsupported_portal_action", action });
  }
}

export const portalController = new PortalController();
