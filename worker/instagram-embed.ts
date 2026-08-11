type InstagramEmbedMedia = {
  video_url?: unknown;
  edge_sidecar_to_children?: {
    edges?: Array<{ node?: InstagramEmbedMedia }>;
  };
};

export function instagramEmbedUrl(sourceUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }

  if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null;
  const match = parsed.pathname.match(/^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (!match) return null;
  return `https://www.instagram.com/p/${match[1]}/embed/captioned/`;
}

function mediaVideoUrl(media: InstagramEmbedMedia | null | undefined): string | null {
  if (typeof media?.video_url === "string" && media.video_url.startsWith("http")) {
    return media.video_url;
  }

  for (const edge of media?.edge_sidecar_to_children?.edges ?? []) {
    const url = mediaVideoUrl(edge.node);
    if (url) return url;
  }
  return null;
}

export function extractInstagramEmbedVideoUrl(html: string): string | null {
  const serialized = html.match(/"init",\[\],\[([\s\S]*?)\]\],/)?.[1];
  if (!serialized) return null;

  try {
    const payload = JSON.parse(serialized) as { contextJSON?: unknown };
    if (typeof payload.contextJSON !== "string") return null;
    const context = JSON.parse(payload.contextJSON) as {
      gql_data?: {
        shortcode_media?: InstagramEmbedMedia | null;
        xdt_shortcode_media?: InstagramEmbedMedia | null;
      };
    };
    return mediaVideoUrl(
      context.gql_data?.shortcode_media ?? context.gql_data?.xdt_shortcode_media,
    );
  } catch {
    return null;
  }
}
