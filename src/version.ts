// バージョンは package.json の version（変更のたびに上げる）。commit はビルドしたコミット。
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
export const APP_COMMIT = typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "dev";
export const VERSION_LABEL = `v${APP_VERSION} (${APP_COMMIT})`;
