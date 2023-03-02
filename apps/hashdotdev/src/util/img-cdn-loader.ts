// Cloudflare Images
// Docs: https://developers.cloudflare.com/images/cloudflare-images/serve-images/serve-images-custom-domains/
export default function cloudflareLoader({ src }) {
    return `https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/${src}`
  };