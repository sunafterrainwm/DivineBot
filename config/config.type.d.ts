import type { Telegraf } from 'telegraf';

export type TextOrFile = string | string[] | {
	path: string;

	parsemode?: 'txt' | 'json';
};

export interface ConfigTS {
	/**
	 * Telegram token
	 */
	token: string;

	/**
	 * 使用 polling 還是 webhook
	 */
	launchType?: 'polling' | 'webhook';

	webhook?: Telegraf.LaunchOptions[ 'webhook' ] & {
		/**
		 * Webhook 最終的完整 URL，可被外部存取，用於呼叫 Telegram 介面自動設定網址
		 */
		url?: string;

		ssl?: {
			certPath: string;
			keyPath: string;
			caPath: string;
		};
	};

	/**
	 * 系統紀錄檔
	 */
	logging?: {
		/**
		 * 紀錄檔等級：從詳細到簡單分別是 debug、info、warning、error，推薦用 info
		 */
		level: 'debug' | 'info' | 'warning' | 'error';

		/**
		 * 紀錄檔檔名，如留空則只向螢幕輸出
		 */
		logfile: string;

		/**
		 * 記錄到某個Telegram頻道
		 * BOT必須是那個頻道的管理員並且可以發訊息
		 */
		logToChannel?: number;
	};

	cleanTimeZone?: string;

	/**
	 * 在某個文件變更時自動重啟（以 exitCode 1 退出）
	 */
	reloadFile?: string;
}
