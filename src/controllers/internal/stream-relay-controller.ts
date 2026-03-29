// @ts-nocheck
import type { Request, Response } from "express";
import { accessPolicy } from "../../policies/access-policy";
import { userRepository } from "../../repositories/user-repository";
import { upstreamGatewayService } from "../../services/proxy/upstream-gateway-service";
import { liveChannelRegistry } from "../../services/relay/live-channel-registry";
import { HttpError } from "../../utils/http-error";
import { getClientIp } from "../../utils/request-context";

function getRequiredHeader(req: Request, name: string) {
  const value = req.header(name);
  if (!value) {
    throw new HttpError(400, "missing_edge_header", { header: name });
  }

  return value;
}

const userCache = new Map<string, { user: any; expiresAt: number }>();
const USER_CACHE_TTL_MS = 15_000;

async function getCachedUser(userId: string) {
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const user = await userRepository.findById(userId);
  if (user) {
    userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  }

  return user;
}

export class StreamRelayController {
  async relay(req: Request, res: Response) {
    const userId = getRequiredHeader(req, "x-edge-user-id");
    const streamType = getRequiredHeader(req, "x-stream-type") as "live" | "movie" | "series";
    const streamId = getRequiredHeader(req, "x-stream-id");
    const extension = getRequiredHeader(req, "x-stream-extension");

    const user = await getCachedUser(userId);
    if (!user) {
      throw new HttpError(404, "edge_user_not_found");
    }

    accessPolicy.assertUserCanAuthenticate(user);
    accessPolicy.assertIpAllowed(user, getClientIp(req));

    if (streamType === "live" && !req.header("range")) {
      await liveChannelRegistry.subscribe({
        key: `${user.upstreamId}:${streamId}`,
        streamId,
        extension,
        request: req,
        response: res,
        openPull: () => upstreamGatewayService.proxyStream(user, "live", streamId, extension),
      });
      return;
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

export const streamRelayController = new StreamRelayController();
