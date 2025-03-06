export function isValidUrl(urlString: string): boolean {
  try {
    // Add http:// if no protocol is specified
    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
      urlString = 'http://' + urlString;
    }

    const url = new URL(urlString);

    // More strict validation
    // Must have a hostname with at least one dot or be localhost/IP
    const hostname = url.hostname;
    const isValidHostname =
      hostname === 'localhost' ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || // IP address
      hostname.includes('.'); // Domain with at least one dot

    // Must have a port for localhost or IP addresses
    if (hostname === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
      return !!url.port;
    }

    return isValidHostname;
  } catch {
    return false;
  }
}

export function normalizeUrl(urlString: string): string {
  // Add http:// if no protocol is specified
  if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
    urlString = 'http://' + urlString;
  }

  // Remove trailing slash
  return urlString.replace(/\/$/, '');
}
