let storedFiles = { js: [], css: [] };

console.log("Background service worker initialized");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.files) {
        console.log("Files received by background.js:", message.files);
        storedFiles = message.files;
    }

    if (message.requestFiles) {
        console.log("Popup requesting files, sending:", storedFiles);
        sendResponse({ files: storedFiles });
    }
    
    return true; // Enable asynchronous response
});
