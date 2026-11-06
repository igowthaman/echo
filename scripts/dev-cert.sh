#!/usr/bin/env bash
# Makes a local certificate authority (CA) and an HTTPS certificate for this
# computer's addresses, so phones on the same Wi-Fi can use Echo over https.
# Calls and installing the app both need https.
#
# Files go to .certs/ (git-ignored). Keep echo-dev-ca.key private: a phone that
# trusts this CA trusts anything signed with that key. Remove the CA from the
# phone when you're done testing.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${CERT_DIR:-.certs}"
mkdir -p "$OUT"
cd "$OUT"

if [ ! -f echo-dev-ca.key ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
    -keyout echo-dev-ca.key -out echo-dev-ca.crt \
    -subj "/CN=Echo local development CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  echo "Created a new local CA: $OUT/echo-dev-ca.crt"
fi

addresses=$(node -e "const os=require('os');console.log(Object.values(os.networkInterfaces()).flat().filter(a=>a&&a.family==='IPv4'&&!a.internal).map(a=>a.address).join(' '))")
names="DNS:localhost,IP:127.0.0.1"
for address in $addresses; do names="$names,IP:$address"; done

openssl req -newkey rsa:2048 -nodes -keyout echo-dev-key.pem -out echo-dev.csr \
  -subj "/CN=Echo development server" 2>/dev/null
# 397 days is the longest validity browsers accept.
openssl x509 -req -in echo-dev.csr -CA echo-dev-ca.crt -CAkey echo-dev-ca.key -CAcreateserial \
  -days 397 -out echo-dev.pem 2>/dev/null \
  -extfile <(printf 'subjectAltName=%s\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\n' "$names")
rm -f echo-dev.csr

echo "Certificate covers: ${names//,/ }"
echo
echo "Next:"
echo "  1. Copy $OUT/echo-dev-ca.crt to your phone and install it:"
echo "     Android: Settings > Security > Encryption & credentials > Install a certificate > CA certificate"
echo "  2. Run: npm run dev:https"
echo "  3. On the phone, open the https:// address the server prints."
