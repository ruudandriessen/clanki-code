function parseIpv4(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return [octets[0], octets[1], octets[2], octets[3]];
}

function isIpv4Loopback(hostname: string): boolean {
  const octets = parseIpv4(hostname);
  if (!octets) {
    return false;
  }

  return octets[0] === 127;
}

export function isLocalhostOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.trim().toLowerCase();
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      isIpv4Loopback(hostname)
    );
  } catch {
    return false;
  }
}
