export function utf8ByteLength(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error("text contains malformed Unicode");
      }
      bytes += 4;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("text contains malformed Unicode");
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
