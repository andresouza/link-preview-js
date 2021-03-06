import cheerio from "cheerio-without-node-native";
import { fetch } from "cross-fetch";
import urlObj from "url";
import { CONSTANTS } from "./constants";

interface ILinkPreviewOptions {
  headers?: Record<string, string>;
  imagesPropertyType?: string;
  proxyUrl?: string;
}

const metaTag = (doc: any, type: string, attr: string) => {
  const nodes = doc(`meta[${attr}='${type}']`);
  return nodes.length ? nodes : null;
};

const metaTagContent = (doc: any, type: string, attr: string) => doc(`meta[${attr}='${type}']`).attr(`content`);

function getTitle(doc: any) {
  let title = metaTagContent(doc, `og:title`, `property`) || metaTagContent(doc, `og:title`, `name`);
  if (!title) {
    title = doc(`title`).text();
  }
  return title;
}

function getSiteName(doc: any) {
  const siteName = metaTagContent(doc, `og:site_name`, `property`) || metaTagContent(doc, `og:site_name`, `name`);
  return siteName;
}

function getDescription(doc: any) {
  const description = metaTagContent(doc, `description`, `name`) || metaTagContent(doc, `Description`, `name`) || metaTagContent(doc, `og:description`, `property`);
  return description;
}

function getMediaType(doc: any) {
  const node = metaTag(doc, `medium`, `name`);
  if (node) {
    const content = node.attr(`content`);
    return content === `image` ? `photo` : content;
  }
  return (metaTagContent(doc, `og:type`, `property`) || metaTagContent(doc, `og:type`, `name`));
}

function getImages(doc: any, rootUrl: string, imagesPropertyType?: string) {
  let images: string[] = [];
  let nodes;
  let src;
  let dic: Record<string, boolean> = {};

  const imagePropertyType = imagesPropertyType ?? `og`;
  nodes = metaTag(doc, `${imagePropertyType}:image`, `property`) || metaTag(doc, `${imagePropertyType}:image`, `name`);

  if (nodes) {
    nodes.each((_: number, node: any) => {
      src = node.attribs.content;
      if (src) {
        src = urlObj.resolve(rootUrl, src);
        images.push(src);
      }
    });
  }

  if (images.length <= 0 && !imagesPropertyType) {
    src = doc(`link[rel=image_src]`).attr(`href`);
    if (src) {
      src = urlObj.resolve(rootUrl, src);
      images = [src];
    } else {
      nodes = doc(`img`);

      if (nodes?.length) {
        dic = {};
        images = [];
        nodes.each((_: number, node: any) => {
          src = node.attribs.src;
          if (src && !dic[src]) {
            dic[src] = true;
            // width = node.attribs.width;
            // height = node.attribs.height;
            images.push(urlObj.resolve(rootUrl, src));
          }
        });
      }
    }
  }

  return images;
}

function getVideos(doc: any) {
  const videos = [];
  let nodeTypes;
  let nodeSecureUrls;
  let nodeType;
  let nodeSecureUrl;
  let video;
  let videoType;
  let videoSecureUrl;
  let width;
  let height;
  let videoObj;
  let index;

  const nodes = metaTag(doc, `og:video`, `property`) || metaTag(doc, `og:video`, `name`);

  if (nodes?.length) {
    nodeTypes = metaTag(doc, `og:video:type`, `property`) || metaTag(doc, `og:video:type`, `name`);
    nodeSecureUrls = metaTag(doc, `og:video:secure_url`, `property`) || metaTag(doc, `og:video:secure_url`, `name`);
    width = metaTagContent(doc, `og:video:width`, `property`) || metaTagContent(doc, `og:video:width`, `name`);
    height = metaTagContent(doc, `og:video:height`, `property`) || metaTagContent(doc, `og:video:height`, `name`);

    for (index = 0; index < nodes.length; index += 1) {
      video = nodes[index].attribs.content;

      nodeType = nodeTypes[index];
      videoType = nodeType ? nodeType.attribs.content : null;

      nodeSecureUrl = nodeSecureUrls[index];
      videoSecureUrl = nodeSecureUrl ? nodeSecureUrl.attribs.content : null;

      videoObj = {
        url: video,
        secureUrl: videoSecureUrl,
        type: videoType,
        width,
        height,
      };
      if (videoType && videoType.indexOf(`video/`) === 0) {
        videos.splice(0, 0, videoObj);
      } else {
        videos.push(videoObj);
      }
    }
  }

  return videos;
}

// returns default favicon (//hostname/favicon.ico) for a url
function getDefaultFavicon(rootUrl: string) {
  return urlObj.resolve(rootUrl, `/favicon.ico`);
}

// returns an array of URL's to favicon images
function getFavicons(doc: any, rootUrl: string) {
  const images = [];
  let nodes = [];
  let src;

  const relSelectors = [
    `rel=icon`,
    `rel="shortcut icon"`,
    `rel=apple-touch-icon`,
  ];

  relSelectors.forEach((relSelector) => {
    // look for all icon tags
    nodes = doc(`link[${relSelector}]`);

    // collect all images from icon tags
    if (nodes.length) {
      nodes.each((_: number, node: any) => {
        src = node.attribs.href;
        if (src) {
          src = urlObj.resolve(rootUrl, src);
          images.push(src);
        }
      });
    }
  });

  // if no icon images, use default favicon location
  if (images.length <= 0) {
    images.push(getDefaultFavicon(rootUrl));
  }

  return images;
}

function parseImageResponse(url: string, contentType: string) {
  return {
    url,
    mediaType: `image`,
    contentType,
    favicons: [getDefaultFavicon(url)],
  };
}

function parseAudioResponse(url: string, contentType: string) {
  return {
    url,
    mediaType: `audio`,
    contentType,
    favicons: [getDefaultFavicon(url)],
  };
}

function parseVideoResponse(url: string, contentType: string) {
  return {
    url,
    mediaType: `video`,
    contentType,
    favicons: [getDefaultFavicon(url)],
  };
}

function parseApplicationResponse(url: string, contentType: string) {
  return {
    url,
    mediaType: `application`,
    contentType,
    favicons: [getDefaultFavicon(url)],
  };
}

function parseTextResponse(
  body: string,
  url: string,
  options: ILinkPreviewOptions = {},
  contentType?: string,
) {
  const doc = cheerio.load(body);

  return {
    url,
    title: getTitle(doc),
    siteName: getSiteName(doc),
    description: getDescription(doc),
    mediaType: getMediaType(doc) || `website`,
    contentType,
    images: getImages(doc, url, options.imagesPropertyType),
    videos: getVideos(doc),
    favicons: getFavicons(doc, url),
  };
}

function parseUnknownResponse(
  body: string,
  url: string,
  options: ILinkPreviewOptions = {},
  contentType?: string,
) {
  return parseTextResponse(body, url, options, contentType);
}

export async function getLinkPreview(
  text: string,
  options?: ILinkPreviewOptions,
) {
  if (!text || typeof text !== `string`) {
    throw new Error(`link-preview-js did not receive a valid url or text`);
  }

  const detectedUrl = text.replace(/\n/g, ` `).split(` `).find((token) => CONSTANTS.REGEX_VALID_URL.test(token));

  if (!detectedUrl) {
    throw new Error(`link-preview-js did not receive a valid a url or text`);
  }

  const fetchOptions = { headers: options?.headers ?? {} };

  const fetchUrl = options?.proxyUrl ? options.proxyUrl.concat(detectedUrl) : detectedUrl;

  try {
    const response = await fetch(fetchUrl, fetchOptions);

    // get final URL (after any redirects, strip out proxy url from response url)
    const finalUrl = options?.proxyUrl
      ? response.url.replace(options.proxyUrl, ``)
      : response.url;

    // get content type of response
    let contentType = response.headers.get(`content-type`);

    if (!contentType) {
      const htmlString = await response.text();
      return parseUnknownResponse(htmlString, finalUrl, options);
    }

    if ((contentType as any) instanceof Array) {
      // eslint-disable-next-line prefer-destructuring
      contentType = contentType[0];
    }

    // parse response depending on content type
    if (CONSTANTS.REGEX_CONTENT_TYPE_IMAGE.test(contentType)) {
      return parseImageResponse(finalUrl, contentType);
    }
    if (CONSTANTS.REGEX_CONTENT_TYPE_AUDIO.test(contentType)) {
      return parseAudioResponse(finalUrl, contentType);
    }
    if (CONSTANTS.REGEX_CONTENT_TYPE_VIDEO.test(contentType)) {
      return parseVideoResponse(finalUrl, contentType);
    }
    if (CONSTANTS.REGEX_CONTENT_TYPE_TEXT.test(contentType)) {
      const htmlString = await response.text();
      return parseTextResponse(htmlString, finalUrl, options, contentType);
    }
    if (CONSTANTS.REGEX_CONTENT_TYPE_APPLICATION.test(contentType)) {
      return parseApplicationResponse(finalUrl, contentType);
    }
    const htmlString = await response.text();
    return parseUnknownResponse(htmlString, finalUrl, options);
  } catch (e) {
    throw new Error(
      `link-preview-js could not fetch link information ${e.toString()}`,
    );
  }
}
