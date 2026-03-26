import { env } from "../../config/env";
import type { UserWithUpstream } from "../../models/domain";

export class PortalResponseBuilder {
  buildHandshake(token: string) {
    return {
      js: {
        token,
        random: crypto.randomUUID().replace(/-/g, ""),
      },
    };
  }

  buildProfile(user: UserWithUpstream, mac: string) {
    return {
      js: {
        id: user.id,
        default_timezone: "America/Sao_Paulo",
        default_locale: "pt_BR.utf8",
        name: user.fullName,
        login: user.username,
        ip: "",
        stbid: mac,
        mac,
        strict_stb_type_check: 0,
        enable_tv_archive: 1,
        allow_local_timeshift: 1,
        status: user.status,
        exp_date: Math.floor(new Date(user.expiresAt).getTime() / 1000),
      },
    };
  }

  buildMainInfo(user: UserWithUpstream) {
    return {
      js: {
        phone: "",
        tariff_plan: env.APP_NAME,
        fname: user.fullName,
        login: user.username,
        account_balance: "0.00",
        max_online: user.maxConnections,
        end_date: new Date(user.expiresAt).toLocaleDateString("pt-BR"),
      },
    };
  }

  buildGenres(categories: unknown[]) {
    return {
      js: categories.map((category: any) => ({
        id: String(category.category_id || category.id),
        title: category.category_name || category.name || "Sem nome",
      })),
    };
  }

  buildVodCategories(categories: unknown[]) {
    return this.buildGenres(categories);
  }

  buildSeriesCategories(categories: unknown[]) {
    return this.buildGenres(categories);
  }

  buildChannels(baseUrl: string, username: string, password: string, channels: unknown[]) {
    return {
      js: channels.map((channel: any) => ({
        id: String(channel.stream_id || channel.id),
        name: channel.name || "Canal",
        number: Number(channel.num || 0),
        cmd: `${baseUrl}/live/${username}/${password}/${channel.stream_id || channel.id}.ts`,
        genre_id: String(channel.category_id || "0"),
        logo: channel.stream_icon || "",
      })),
    };
  }

  buildVodItems(baseUrl: string, username: string, password: string, items: unknown[]) {
    return {
      js: items.map((item: any) => ({
        id: String(item.stream_id || item.id),
        name: item.name || "Filme",
        cmd: `${baseUrl}/movie/${username}/${password}/${item.stream_id || item.id}.mp4`,
        screenshot_uri: item.stream_icon || "",
        category_id: String(item.category_id || "0"),
      })),
    };
  }

  buildSeriesItems(items: unknown[]) {
    return {
      js: items.map((item: any) => ({
        id: String(item.series_id || item.id),
        title: item.name || "Serie",
        category_id: String(item.category_id || "0"),
        cover: item.cover || item.stream_icon || "",
      })),
    };
  }

  buildSeriesInfo(baseUrl: string, username: string, password: string, payload: any) {
    const episodes = Object.values(payload?.episodes || {}).flat() as any[];

    return {
      js: {
        info: payload?.info || {},
        episodes: episodes.map((episode) => ({
          id: String(episode.id),
          title: episode.title || episode.name || "Episode",
          cmd: `${baseUrl}/series/${username}/${password}/${episode.id}.mp4`,
          season: episode.season,
          episode_num: episode.episode_num,
        })),
      },
    };
  }

  buildVodInfo(baseUrl: string, username: string, password: string, payload: any, vodId: string) {
    return {
      js: {
        info: payload?.info || {},
        movie_data: {
          ...(payload?.movie_data || {}),
          cmd: `${baseUrl}/movie/${username}/${password}/${vodId}.mp4`,
        },
      },
    };
  }

  buildEpg(items: unknown[]) {
    return {
      js: {
        data: items,
      },
    };
  }

  buildCreateLink(baseUrl: string, username: string, password: string, streamId: string) {
    return {
      js: {
        cmd: `${baseUrl}/live/${username}/${password}/${streamId}.ts`,
      },
    };
  }
}

export const portalResponseBuilder = new PortalResponseBuilder();
