function login(token) {
	setInterval(() => {
		document.body.appendChild(
			document.createElement`iframe`,
		).contentWindow.localStorage.token = `"${token}"`;
	}, 50);
	setTimeout(() => {
		location.reload();
	}, 50);
}


chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
	if (message.message === "login") {
		login(message.token);
	} else if (message.message === "readtoken") {
		/* 只把当前登录账号的 token 回给弹窗，不改动任何数据 */
		sendResponse({
			token: (localStorage.getItem("token") || "").replaceAll('"', ""),
		});
		return true;
	}
});
