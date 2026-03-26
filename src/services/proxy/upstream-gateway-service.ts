import { xtreamUpstreamAdapter } from "../../adapters/upstream/xtream-upstream-adapter";
import { env } from "../../config/env";
import type { UserWithUpstream } from "../../models/domain";
import { upstreamRepository } from "../../repositories/upstream-repository";
import { cacheService } from "./cache-service";
import { upstreamHealthService } from "./upstream-health-service";

type ResolvedCredentials = {
  apiBaseUrl: string;
  playlistBaseUrl: string;
  streamBaseUrl: string;
  username: string;
  password: string;
};

export class UpstreamGatewayService {
  private static readonly TTL = {
    playerApi: 60_000,
    categories: 300_000,
    liveStreams: 60_000,
    vodStreams: 180_000,
    series: 180_000,
    info: 900_000,
    epg: 600_000,
    playlist: 60_000,
  };

  private buildResolvedCredentials(user: UserWithUpstream, upstream: any): ResolvedCredentials {
    const apiBaseUrl = upstream?.xciptvDns || upstream?.smartersUrl;
    const playlistBaseUrl = upstream?.smartersUrl || upstream?.xciptvDns;
    const streamBaseUrl = upstream?.smartersUrl || upstream?.xciptvDns;

    return {
      apiBaseUrl,
      playlistBaseUrl,
      streamBaseUrl,
      username: env.BOOTSTRAP_UPSTREAM_USERNAME || user.upstreamUsername,
      password: env.BOOTSTRAP_UPSTREAM_PASSWORD || user.upstreamPassword,
    };
  }

  private isAuthZero(payload: any) {
    return Number(payload?.user_info?.auth ?? 1) === 0;
  }

  private async resolveBaseUpstream(user: UserWithUpstream) {
    const preferred = await upstreamRepository.findById(user.upstreamId);
    const candidate = await upstreamHealthService.pickCandidate(preferred);
    if (!candidate) {
      throw new Error("no_upstream_available");
    }

    const healthy = await upstreamHealthService.check(candidate);
    const upstream = healthy ? candidate : await upstreamHealthService.pickCandidate(null);
    if (!upstream) {
      throw new Error("no_healthy_upstream_available");
    }

    return upstream;
  }

  async resolveCredentials(user: UserWithUpstream) {
    return this.buildResolvedCredentials(user, await this.resolveBaseUpstream(user));
  }

  private distinctBaseUrls(...values: Array<string | null | undefined>) {
    return [...new Set(values.filter((value): value is string => Boolean(value)))];
  }

  async getPlayerApi(user: UserWithUpstream) {
    const key = `player_api:${user.id}`;
    const cached = cacheService.get(key);
    if (cached) {
      return cached;
    }

    const credentials = await this.resolveCredentials(user);
    const response = await xtreamUpstreamAdapter.getPlayerApi({
      ...credentials,
      baseUrl: credentials.apiBaseUrl,
    } as any);

    cacheService.set(key, response.data, UpstreamGatewayService.TTL.playerApi);
    return response.data;
  }

  async getLiveCategories(user: UserWithUpstream) {
    const key = `live_categories:${user.id}`;
    const cached = cacheService.get(key);
    if (cached) {
      return cached;
    }

    const credentials = await this.resolveCredentials(user);
    const response = await xtreamUpstreamAdapter.getLiveCategories({
      ...credentials,
      baseUrl: credentials.apiBaseUrl,
    } as any);

    cacheService.set(key, response.data, UpstreamGatewayService.TTL.categories);
    return response.data;
  }

  async getVodCategories(user: UserWithUpstream) {
    const key = `vod_categories:${user.id}`;
    const cached = cacheService.get(key);
    if (cached) {
      return cached;
    }

    const credentials = await this.resolveCredentials(user);
    const response = await xtreamUpstreamAdapter.getVodCategories({
      ...credentials,
      baseUrl: credentials.apiBaseUrl,
    } as any);
    cacheService.set(key, response.data, UpstreamGatewayService.TTL.categories);
    return response.data;
  }

  async getSeriesCategories(user: UserWithUpstream) {
    const key = `series_categories:${user.id}`;
    const cached = cacheService.get(key);
    if (cached) {
      return cached;
    }

    const credentials = await this.resolveCredentials(user);
    const response = await xtreamUpstreamAdapter.getSeriesCategories({
      ...credentials,
      baseUrl: credentials.apiBaseUrl,
    } as any);
    cacheService.set(key, response.data, UpstreamGatewayService.TTL.categories);
    return response.data;
  }

  async getLiveStreams(user: UserWithUpstream, categoryId?: string) {
    const key = `live_streams:${user.id}:${categoryId || "all"}`;
    const cached = cacheService.get(key);
    if (cached) {
      return cached;
    }

    const credentials = await this.resolveCredentials(user);
    const payload = (
      await xtreamUpstreamAdapter.getLiveStreams(
        { ...credentials, baseUrl: credentials.apiBaseUrl } as any,
        categoryId,
      )
    ).data;
    cacheService.set(key, payload, UpstreamGatewayService.TTL.liveStreams);
    return payload;
  }

  async getVodStreams(user: UserWithUpstream, categoryId?: string) {
    const key = `vod_streams:${user.id}:${categoryId || "all"}`;
    const cached = cacheService.get(key);
    if (cached) {
      return cached;
    }

    const credentials = await this.resolveCredentials(user);
    const payload = (
      await xtreamUpstreamAdapter.getVodStreams(
        { ...credentials, baseUrl: credentials.apiBaseUrl } as any,
        categoryId,
      )
    ).data;
    cacheService.set(key, payload, UpstreamGatewayService.TTL.vodStreams);
    return payload;
  }

  async getSeries(user: UserWithUpstream, categoryId?: string) {
    const key = `series:${user.id}:${categoryId || "all"}`;
    const cached = cacheService.get(key);
    if (cached) {
      return cached;
    }

    const credentials = await this.resolveCredentials(user);
    const payload = (
      await xtreamUpstreamAdapter.getSeries(
        { ...credentials, baseUrl: credentials.apiBaseUrl } as any,
        categoryId,
      )
    ).data;
    cacheService.set(key, payload, UpstreamGatewayService.TTL.series);
    return payload;
  }

  async getSeriesInfo(user: UserWithUpstream, seriesId: string) {
    const key = `series_info:${user.id}:${seriesId}`;
    const cached = cacheService.get(key);
    if (cached) {
      return cached;
    }

    const credentials = await this.resolveCredentials(user);
    const payload = (
      await xtreamUpstreamAdapter.getSeriesInfo(
        { ...credentials, baseUrl: credentials.apiBaseUrl } as any,
        seriesId,
      )
    ).data;
    cacheService.set(key, payload, UpstreamGatewayService.TTL.info);
    return payload;
  }

  async getVodInfo(user: UserWithUpstream, vodId: string) {
    const key = `vod_info:${user.id}:${vodId}`;
    const cached = cacheService.get(key);
    if (cached) {
      return cached;
    }

    const credentials = await this.resolveCredentials(user);
    const payload = (
      await xtreamUpstreamAdapter.getVodInfo(
        { ...credentials, baseUrl: credentials.apiBaseUrl } as any,
        vodId,
      )
    ).data;
    cacheService.set(key, payload, UpstreamGatewayService.TTL.info);
    return payload;
  }

  async getXmltv(user: UserWithUpstream) {
    const key = `xmltv:${user.id}`;
    const cached = cacheService.get<string>(key);
    if (cached) {
      return cached;
    }

    const credentials = await this.resolveCredentials(user);
    const payload = (await xtreamUpstreamAdapter.getXmltv({ ...credentials, baseUrl: credentials.apiBaseUrl } as any))
      .data;
    cacheService.set(key, payload, UpstreamGatewayService.TTL.epg);
    return payload;
  }

  async getPlaylist(user: UserWithUpstream, output: string) {
    const key = `playlist:${user.id}:${output}`;
    const cached = cacheService.get<string>(key);
    if (cached) {
      return cached;
    }

    const credentials = await this.resolveCredentials(user);
    const baseUrls = this.distinctBaseUrls(credentials.playlistBaseUrl, credentials.apiBaseUrl);
    let lastError: unknown;

    for (const baseUrl of baseUrls) {
      try {
        const payload = (await xtreamUpstreamAdapter.getPlaylist({ ...credentials, baseUrl } as any, output)).data;
        cacheService.set(key, payload, UpstreamGatewayService.TTL.playlist);
        return payload;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("upstream_playlist_failed");
  }

  async proxyStream(
    user: UserWithUpstream,
    streamType: "live" | "movie" | "series",
    streamId: string,
    extension: string,
    range?: string,
  ) {
    const credentials = await this.resolveCredentials(user);
    const baseUrls = this.distinctBaseUrls(credentials.streamBaseUrl, credentials.playlistBaseUrl);
    let lastError: unknown;

    for (const baseUrl of baseUrls) {
      try {
        return await xtreamUpstreamAdapter.proxyStream(
          { ...credentials, baseUrl } as any,
          streamType,
          streamId,
          extension,
          range,
        );
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("upstream_stream_failed");
  }

  async buildStreamUrl(
    user: UserWithUpstream,
    streamType: "live" | "movie" | "series",
    streamId: string,
    extension: string,
  ) {
    const credentials = await this.resolveCredentials(user);
    const baseUrl = this.distinctBaseUrls(credentials.streamBaseUrl, credentials.playlistBaseUrl)[0];
    return xtreamUpstreamAdapter.buildStreamUrl({ ...credentials, baseUrl } as any, streamType, streamId, extension);
  }
}

export const upstreamGatewayService = new UpstreamGatewayService();
