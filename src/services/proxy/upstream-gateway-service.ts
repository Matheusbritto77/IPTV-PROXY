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

    cacheService.set(key, response.data, 30_000);
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

    cacheService.set(key, response.data, 120_000);
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
    cacheService.set(key, response.data, 120_000);
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
    cacheService.set(key, response.data, 120_000);
    return response.data;
  }

  async getLiveStreams(user: UserWithUpstream, categoryId?: string) {
    const credentials = await this.resolveCredentials(user);
    return (
      await xtreamUpstreamAdapter.getLiveStreams(
        { ...credentials, baseUrl: credentials.apiBaseUrl } as any,
        categoryId,
      )
    ).data;
  }

  async getVodStreams(user: UserWithUpstream, categoryId?: string) {
    const credentials = await this.resolveCredentials(user);
    return (
      await xtreamUpstreamAdapter.getVodStreams(
        { ...credentials, baseUrl: credentials.apiBaseUrl } as any,
        categoryId,
      )
    ).data;
  }

  async getSeries(user: UserWithUpstream, categoryId?: string) {
    const credentials = await this.resolveCredentials(user);
    return (
      await xtreamUpstreamAdapter.getSeries(
        { ...credentials, baseUrl: credentials.apiBaseUrl } as any,
        categoryId,
      )
    ).data;
  }

  async getSeriesInfo(user: UserWithUpstream, seriesId: string) {
    const credentials = await this.resolveCredentials(user);
    return (
      await xtreamUpstreamAdapter.getSeriesInfo(
        { ...credentials, baseUrl: credentials.apiBaseUrl } as any,
        seriesId,
      )
    ).data;
  }

  async getVodInfo(user: UserWithUpstream, vodId: string) {
    const credentials = await this.resolveCredentials(user);
    return (
      await xtreamUpstreamAdapter.getVodInfo(
        { ...credentials, baseUrl: credentials.apiBaseUrl } as any,
        vodId,
      )
    ).data;
  }

  async getXmltv(user: UserWithUpstream) {
    const credentials = await this.resolveCredentials(user);
    return (await xtreamUpstreamAdapter.getXmltv({ ...credentials, baseUrl: credentials.apiBaseUrl } as any))
      .data;
  }

  async getPlaylist(user: UserWithUpstream, output: string) {
    const credentials = await this.resolveCredentials(user);
    const baseUrls = this.distinctBaseUrls(credentials.playlistBaseUrl, credentials.apiBaseUrl);
    let lastError: unknown;

    for (const baseUrl of baseUrls) {
      try {
        return (await xtreamUpstreamAdapter.getPlaylist({ ...credentials, baseUrl } as any, output)).data;
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
