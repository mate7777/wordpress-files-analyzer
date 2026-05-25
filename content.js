// content.js
function collectFiles() {
    const jsFiles = Array.from(document.querySelectorAll('script[src]'))
      .map(script => script.src)
      .filter(src => src);
      
    const cssFiles = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .map(link => link.href)
      .filter(href => href);
      
    return { js: jsFiles, css: cssFiles };
  }
  
  // Send files to background script
  chrome.runtime.sendMessage({ 
    files: collectFiles() 
  });
  