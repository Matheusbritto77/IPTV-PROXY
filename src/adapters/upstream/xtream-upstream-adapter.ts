import axios, { type AxiosInstance } from "axios";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { HttpError } from "../../utils/http-error";

type UpstreamCredentials = {
  baseUrl: string;
  username: string;
  password: string;
};

export class XtreamUpstreamAdapter {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: env.UPSTREAM_TIMEOUT_MS,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) IPTVStreamPlayer/1.0",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Connection: "keep-alive",
        Referer: env.APP_BASE_URL,
      },
    });
  }

  getPlayerApi(credentials: UpstreamCredentials) {
    return this.callPlayerApi(credentials);
  }

  ping(baseUrl: string) {
    return this.client.get(`${baseUrl}/player_api.php`, {
      validateStatus: (status) => status >= 200 && status < 500,
    });
  }

  getLiveCategories(credentials: UpstreamCredentials) {
    return this.callPlayerApi(credentials, { action: "get_live_categories" });
  }

  getVodCategories(credentials: UpstreamCredentials) {
    return this.callPlayerApi(credentials, { action: "get_vod_categories" });
  }

  getSeriesCategories(credentials: UpstreamCredentials) {
    return this.callPlayerApi(credentials, { action: "get_series_categories" });
  }

  getLiveStreams(credentials: UpstreamCredentials, categoryId?: string) {
    return this.callPlayerApi(credentials, {
      action: "get_live_streams",
      category_id: categoryId,
    });
  }

  getVodStreams(credentials: UpstreamCredentials, categoryId?: string) {
    return this.callPlayerApi(credentials, {
      action: "get_vod_streams",
      category_id: categoryId,
    });
  }

  getSeries(credentials: UpstreamCredentials, categoryId?: string) {
    return this.callPlayerApi(credentials, {
      action: "get_series",
      category_id: categoryId,
    });
  }

  getSeriesInfo(credentials: UpstreamCredentials, seriesId: string) {
    return this.callPlayerApi(credentials, {
      action: "get_series_info",
      series_id: seriesId,
    });
  }

  getVodInfo(credentials: UpstreamCredentials, vodId: string) {
    return this.callPlayerApi(credentials, {
      action: "get_vod_info",
      vod_id: vodId,
    });
  }

  async getXmltv(credentials: UpstreamCredentials) {
    return this.client.get(`${credentials.baseUrl}/xmltv.php`, {
      params: {
        username: credentials.username,
        password: credentials.password,
      },
      responseType: "text",
    });
  }

  async getPlaylist(credentials: UpstreamCredentials, output: string) {
    return this.client.get(`${credentials.baseUrl}/get.php`, {
      params: {
        username: credentials.username,
        password: credentials.password,
        type: "m3u_plus",
        output,
      },
      responseType: "text",
      validateStatus: () => true,
    }).then((response) => {
      logger.info(
        {
          upstreamUrl: `${credentials.baseUrl}/get.php`,
          action: "get_playlist",
          status: response.status,
          contentType: response.headers["content-type"],
        },
        "upstream_playlist_response",
      );

      if (response.status >= 400) {
        throw new HttpError(response.status, "upstream_playlist_failed");
      }

      return response;
    });
  }

  async proxyStream(
    credentials: UpstreamCredentials,
    streamType: "live" | "movie" | "series",
    streamId: string,
    extension: string,
    range?: string,
  ) {
    let lastStatus = 500;
    for (const url of this.buildStreamUrls(credentials, streamType, streamId, extension)) {
      const response = await this.client.get(url, {
        responseType: "stream",
        headers: range ? { Range: range } : undefined,
        validateStatus: () => true,
      });

      if (response.status < 400) {
        return response;
      }

      lastStatus = response.status;
    }

    throw new HttpError(lastStatus, "upstream_stream_failed");
  }

  buildStreamUrl(
    credentials: UpstreamCredentials,
    streamType: "live" | "movie" | "series",
    streamId: string,
    extension: string,
  ) {
    return this.buildStreamUrls(credentials, streamType, streamId, extension)[0];
  }

  private buildStreamUrls(
    credentials: UpstreamCredentials,
    streamType: "live" | "movie" | "series",
    streamId: string,
    extension: string,
  ) {
    const urls = [
      `${credentials.baseUrl}/${streamType}/${credentials.username}/${credentials.password}/${streamId}.${extension}`,
    ];

    if (streamType === "live") {
      urls.unshift(`${credentials.baseUrl}/${credentials.username}/${credentials.password}/${streamId}`);
    }

    return urls;
  }

  private callPlayerApi(credentials: UpstreamCredentials, params?: Record<string, string | undefined>) {
    const url = `${credentials.baseUrl}/player_api.php`;
    return this.client.get(url, {
      params: {
        username: credentials.username,
        password: credentials.password,
        ...params,
      },
      validateStatus: () => true,
    }).then((response) => {
      logger.info(
        {
          upstreamUrl: url,
          action: params?.action || "player_api",
          status: response.status,
          contentType: response.headers["content-type"],
          auth: response.data?.user_info?.auth,
          body: Number(response.data?.user_info?.auth ?? 1) === 0 ? response.data : undefined,
        },
        "upstream_player_api_response",
      );

      if (response.status >= 400) {
        throw new HttpError(response.status, "upstream_player_api_failed");
      }

      return response;
    });
  }
}

export const xtreamUpstreamAdapter = new XtreamUpstreamAdapter();
