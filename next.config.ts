import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// This computer's network addresses, so phones on the same Wi-Fi can load the
// dev server. Next blocks dev assets for hosts it doesn't recognise.
const networkAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((address) => address && address.family === "IPv4" && !address.internal)
  .map((address) => address!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.localhost", ...networkAddresses],
};

export default nextConfig;
