import { ConfigTS } from 'config/config.type';

/**
 * 機器人的設定檔
 */
export const config: ConfigTS = {
	token: '', // BotFather 給你的 Token，類似「123456789:q234fipjfjaewkflASDFASjaslkdf」

	// 使用 polling 還是 webhook
	launchType: 'polling',

	// 使用 Webhook 模式，參見 https://core.telegram.org/bots/webhooks
	webhook: {
		port: 0, // Webhook 埠，為 0 時不啟用 Webhook
		hookPath: '', // Webhook 路徑
		url: '', // Webhook 最終的完整 URL，可被外部存取，用於呼叫 Telegram 介面自動設定網址
		ssl: {
			certPath: '', // SSL 憑證，為空時使用 HTTP 協定
			keyPath: '', // SSL 金鑰
			caPath: '' // 如使用自簽章憑證，CA 憑證路徑
		}
	},

	logging: {
		/**
		 * 紀錄檔等級：從詳細到簡單分別是 debug、info、warning、error，推薦用 info
		 */
		level: 'debug',

		/**
		 * 紀錄檔檔名，如留空則只向螢幕輸出
		 */
		logfile: ''
	}
};
