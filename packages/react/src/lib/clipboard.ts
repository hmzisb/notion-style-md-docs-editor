/**
 * The DOM types promise a clipboard on every navigator, but an insecure context has none and
 * the user can refuse the write. Both end here, and the caller says whether it worked.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
