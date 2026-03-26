type XmltvProgramme = {
  channel: string;
  start: string;
  stop: string;
  title: string;
  desc: string;
};

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function toIsoDate(value: string) {
  const normalized = value.replace(/\s+([+\-]\d{4})$/, "$1");
  const parts = normalized.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([+\-]\d{4})?$/);
  if (!parts) {
    return new Date().toISOString();
  }

  const [, year, month, day, hour, minute, second] = parts;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
}

export class EpgService {
  parseXmltv(xml: string) {
    const programmes: XmltvProgramme[] = [];
    const regex = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;

    for (const match of xml.matchAll(regex)) {
      const attrs = match[1] || "";
      const body = match[2] || "";
      const channel = attrs.match(/channel="([^"]+)"/)?.[1] || "";
      const start = attrs.match(/start="([^"]+)"/)?.[1] || "";
      const stop = attrs.match(/stop="([^"]+)"/)?.[1] || "";
      const title = decodeXml(body.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() || "");
      const desc = decodeXml(body.match(/<desc[^>]*>([\s\S]*?)<\/desc>/)?.[1]?.trim() || "");

      programmes.push({ channel, start, stop, title, desc });
    }

    return programmes;
  }

  getShortEpg(xml: string, channelId: string, limit = 10) {
    return this.parseXmltv(xml)
      .filter((item) => item.channel === channelId)
      .slice(0, limit)
      .map((item, index) => ({
        id: `${channelId}:${index}`,
        name: item.title,
        text: item.desc,
        start_timestamp: Math.floor(new Date(toIsoDate(item.start)).getTime() / 1000),
        stop_timestamp: Math.floor(new Date(toIsoDate(item.stop)).getTime() / 1000),
      }));
  }

  getEpgInfo(xml: string, channelId: string, from?: number, to?: number) {
    return this.parseXmltv(xml)
      .filter((item) => item.channel === channelId)
      .map((item, index) => ({
        id: `${channelId}:${index}`,
        title: item.title,
        description: item.desc,
        start: toIsoDate(item.start),
        end: toIsoDate(item.stop),
      }))
      .filter((item) => {
        const ts = new Date(item.start).getTime();
        if (from && ts < from * 1000) return false;
        if (to && ts > to * 1000) return false;
        return true;
      });
  }
}

export const epgService = new EpgService();
