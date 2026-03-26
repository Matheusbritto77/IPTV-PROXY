import { env } from "../../config/env";
import type { UserWithUpstream } from "../../models/domain";

type RewriteContext = {
  user: UserWithUpstream;
  publicUsername: string;
  publicPassword: string;
  upstreamUsername: string;
  upstreamPassword: string;
  output?: string;
  upstreamBaseUrl: string;
};

function unix(date: Date) {
  return Math.floor(date.getTime() / 1000).toString();
}

export class XtreamRewriteService {
  private appUrl() {
    return new URL(env.APP_BASE_URL);
  }

  private normalizeBaseUrl(url: string) {
    return url.replace(/\/+$/, "");
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  rewritePlayerApi(payload: any, context: RewriteContext) {
    const appUrl = this.appUrl();
    const publicProtocol = env.APP_PUBLIC_PROTOCOL === "auto" ? appUrl.protocol.replace(":", "") : env.APP_PUBLIC_PROTOCOL;
    const isHttps = publicProtocol === "https";
    const inferredPort = appUrl.port || (isHttps ? "443" : "80");
    const cloned = structuredClone(payload ?? {});
    const upstreamUserInfo = cloned.user_info || {};

    cloned.user_info = {
      ...upstreamUserInfo,
      username: context.publicUsername,
      password: context.publicPassword,
      auth: 1,
      status: "Active",
      exp_date: unix(new Date(context.user.expiresAt)),
      created_at: unix(new Date(context.user.createdAt)),
      active_cons: String(Math.max(Number(upstreamUserInfo.active_cons || 0), 1)),
      max_connections: String(context.user.maxConnections),
    };

    cloned.server_info = {
      ...(cloned.server_info || {}),
      url: appUrl.hostname,
      port: inferredPort,
      https_port: isHttps ? inferredPort : "443",
      server_protocol: publicProtocol,
      timezone: "America/Sao_Paulo",
      timestamp_now: Math.floor(Date.now() / 1000),
    };

    return cloned;
  }

  rewritePlaylist(content: string, context: RewriteContext) {
    const appBaseUrl = this.normalizeBaseUrl(env.APP_BASE_URL);
    const upstreamBaseUrl = this.normalizeBaseUrl(context.upstreamBaseUrl);
    const output = context.output || "ts";
    const streamExtension = output === "m3u8" ? "m3u8" : "ts";
    const bareStreamPattern = new RegExp(
      `${this.escapeRegex(upstreamBaseUrl)}/${this.escapeRegex(context.upstreamUsername)}/${this.escapeRegex(context.upstreamPassword)}/(\\d+)`,
      "g",
    );

    return content
      .replaceAll(
        `${upstreamBaseUrl}/live/${context.upstreamUsername}/${context.upstreamPassword}/`,
        `${appBaseUrl}/live/${context.publicUsername}/${context.publicPassword}/`,
      )
      .replaceAll(
        `${upstreamBaseUrl}/movie/${context.upstreamUsername}/${context.upstreamPassword}/`,
        `${appBaseUrl}/movie/${context.publicUsername}/${context.publicPassword}/`,
      )
      .replaceAll(
        `${upstreamBaseUrl}/series/${context.upstreamUsername}/${context.upstreamPassword}/`,
        `${appBaseUrl}/series/${context.publicUsername}/${context.publicPassword}/`,
      )
      .replaceAll(
        `/get.php?username=${context.upstreamUsername}&password=${context.upstreamPassword}&type=m3u_plus&output=${output}`,
        `/get.php?username=${context.publicUsername}&password=${context.publicPassword}&type=m3u_plus&output=${output}`,
      )
      .replaceAll(
        `${upstreamBaseUrl}/get.php?username=${context.upstreamUsername}&password=${context.upstreamPassword}&type=m3u_plus&output=${output}`,
        `${appBaseUrl}/get.php?username=${context.publicUsername}&password=${context.publicPassword}&type=m3u_plus&output=${output}`,
      )
      .replace(bareStreamPattern, `${appBaseUrl}/live/${context.publicUsername}/${context.publicPassword}/$1.${streamExtension}`);
  }

  private rewriteAnyString(value: string, context: RewriteContext) {
    const appBaseUrl = this.normalizeBaseUrl(env.APP_BASE_URL);
    const upstreamBaseUrl = this.normalizeBaseUrl(context.upstreamBaseUrl);

    return value
      .replaceAll(
        `${upstreamBaseUrl}/live/${context.upstreamUsername}/${context.upstreamPassword}/`,
        `${appBaseUrl}/live/${context.publicUsername}/${context.publicPassword}/`,
      )
      .replaceAll(
        `${upstreamBaseUrl}/movie/${context.upstreamUsername}/${context.upstreamPassword}/`,
        `${appBaseUrl}/movie/${context.publicUsername}/${context.publicPassword}/`,
      )
      .replaceAll(
        `${upstreamBaseUrl}/series/${context.upstreamUsername}/${context.upstreamPassword}/`,
        `${appBaseUrl}/series/${context.publicUsername}/${context.publicPassword}/`,
      )
      .replaceAll(
        `${upstreamBaseUrl}/get.php?username=${context.upstreamUsername}&password=${context.upstreamPassword}`,
        `${appBaseUrl}/get.php?username=${context.publicUsername}&password=${context.publicPassword}`,
      );
  }

  rewritePayload(payload: any, context: RewriteContext): any {
    if (Array.isArray(payload)) {
      return payload.map((item) => this.rewritePayload(item, context));
    }

    if (payload && typeof payload === "object") {
      const clone: Record<string, any> = {};
      for (const [key, value] of Object.entries(payload)) {
        if (typeof value === "string") {
          clone[key] = this.rewriteAnyString(value, context);
          continue;
        }

        clone[key] = this.rewritePayload(value, context);
      }
      return clone;
    }

    return payload;
  }
}

export const xtreamRewriteService = new XtreamRewriteService();
