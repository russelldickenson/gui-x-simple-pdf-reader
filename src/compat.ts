// PDF.js 6 targets Safari 18 / Chrome 125. These two APIs are the only
// baseline gaps we hit on older macOS WebKit installations, so shim them.
// The app still needs a reasonably modern webview (macOS 13+, WebView2).

const promise = Promise as PromiseConstructor & {
  withResolvers?: <T>() => {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
};

promise.withResolvers ??= function withResolvers<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const p = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise: p, resolve, reject };
};

const URLCtor = URL as typeof URL & { parse?: (url: string, base?: string) => URL | null };
URLCtor.parse ??= (url: string, base?: string) => {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
};

export {};
