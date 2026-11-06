// GET /.well-known/assetlinks.json → tells Android that the Echo APK belongs to
// this site, so the app opens full screen with no browser bar (a Trusted Web
// Activity). Set ANDROID_PACKAGE_NAME and ANDROID_CERT_SHA256 (comma-separated
// SHA-256 fingerprints of the signing keys) once the APK exists.
export const dynamic = 'force-dynamic';

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME;
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((fingerprint) => fingerprint.trim().toUpperCase())
    .filter(Boolean);

  if (!packageName || fingerprints.length === 0) {
    return new Response('No Android app is linked to this site yet.', { status: 404 });
  }

  return Response.json(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: fingerprints },
      },
    ],
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
