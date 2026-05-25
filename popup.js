// popup.js
document.addEventListener("DOMContentLoaded", () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            function: collectFilesFromPage
        }, (results) => {
            if (chrome.runtime.lastError) {
                document.getElementById("file-list").innerHTML = 
                    "<li>Error: " + chrome.runtime.lastError.message + "</li>";
                return;
            }
            
            const files = results && results[0] ? results[0].result : null;
            displayFiles(files);
        });
    });
});

// Function injected into the page
function collectFilesFromPage() {
    // Normalize URLs by removing query parameters.
    function normalizeUrl(url) {
        return url.split('?')[0];
    }

    function formatFileForDisplay(fileUrl) {
        try {
            const url = new URL(fileUrl);
            if (url.origin === location.origin) {
                return `${url.pathname}${url.search}`;
            }

            return fileUrl;
        } catch (error) {
            return fileUrl;
        }
    }
    
    // Collect all scripts and stylesheets.
    const jsFiles = Array.from(document.querySelectorAll('script[src]'))
        .map(script => script.src)
        .filter(src => src);
        
    const cssFiles = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
        .map(link => link.href)
        .filter(href => href);
    
    // Detect duplicates using normalized URLs.
    function countOccurrencesNormalized(array) {
        const normalizedCount = {};
        const originalUrls = {};
        
        array.forEach(url => {
            const normalized = normalizeUrl(url);
            
            // Store the original URL for each normalized URL.
            if (!originalUrls[normalized]) {
                originalUrls[normalized] = [];
            }
            originalUrls[normalized].push(url);
            
            // Count normalized URL occurrences.
            normalizedCount[normalized] = (normalizedCount[normalized] || 0) + 1;
        });
        
        // Map each original URL to its normalized count.
        const result = {};
        array.forEach(url => {
            const normalized = normalizeUrl(url);
            result[url] = {
                count: normalizedCount[normalized],
                variants: originalUrls[normalized]
            };
        });
        
        return result;
    }
    
    const jsCount = countOccurrencesNormalized(jsFiles);
    const cssCount = countOccurrencesNormalized(cssFiles);
    
    // Group by source.
    const organized = {
        plugins: { js: [], css: [] },
        theme: { js: [], css: [] },
        wordpress: { js: [], css: [] },
        other: { js: [], css: [] }
    };
    
    // Categorize a file by source.
    function categorizeFile(file, type, countMap) {
        const url = new URL(file);
        const path = url.pathname;
        const normalizedUrl = normalizeUrl(file);
        const isDuplicate = countMap[file].count > 1;
        const variants = countMap[file].variants;
        
        // Plugin files.
        if (path.includes('/wp-content/plugins/')) {
            // Extract the plugin folder name.
            const pluginMatch = path.match(/\/wp-content\/plugins\/([^\/]+)/);
            const pluginName = pluginMatch ? pluginMatch[1] : 'unknown-plugin';
            
            organized.plugins[type].push({
                path: file,
                displayPath: formatFileForDisplay(file),
                pageOrigin: location.origin,
                normalizedPath: normalizedUrl,
                plugin: pluginName,
                duplicate: isDuplicate,
                count: countMap[file].count,
                variants: variants
            });
        }
        // Theme files.
        else if (path.includes('/wp-content/themes/')) {
            organized.theme[type].push({
                path: file,
                displayPath: formatFileForDisplay(file),
                pageOrigin: location.origin,
                normalizedPath: normalizedUrl,
                duplicate: isDuplicate,
                count: countMap[file].count,
                variants: variants
            });
        }
        // WordPress core files.
        else if (path.includes('/wp-includes/') || path.includes('/wp-admin/')) {
            organized.wordpress[type].push({
                path: file,
                displayPath: formatFileForDisplay(file),
                pageOrigin: location.origin,
                normalizedPath: normalizedUrl,
                duplicate: isDuplicate,
                count: countMap[file].count,
                variants: variants
            });
        }
        // Other files.
        else {
            organized.other[type].push({
                path: file,
                displayPath: formatFileForDisplay(file),
                pageOrigin: location.origin,
                normalizedPath: normalizedUrl,
                duplicate: isDuplicate,
                count: countMap[file].count,
                variants: variants
            });
        }
    }
    
    // Categorize all files.
    jsFiles.forEach(file => categorizeFile(file, 'js', jsCount));
    cssFiles.forEach(file => categorizeFile(file, 'css', cssCount));
    
    // Deduplicate final results so the same normalized file is not displayed several times.
    function deduplicateFiles(files) {
        const result = {
            plugins: { js: [], css: [] },
            theme: { js: [], css: [] },
            wordpress: { js: [], css: [] },
            other: { js: [], css: [] }
        };
        
        Object.keys(files).forEach(category => {
            ['js', 'css'].forEach(type => {
                const seen = new Set();
                
                files[category][type].forEach(file => {
                    if (!seen.has(file.normalizedPath)) {
                        seen.add(file.normalizedPath);
                        result[category][type].push(file);
                    }
                });
            });
        });
        
        return result;
    }
    
    return deduplicateFiles(organized);
}

function displayFiles(files) {
    const list = document.getElementById("file-list");
    list.innerHTML = "";

    if (!files) {
        const item = document.createElement("li");
        item.textContent = "No usable result";
        list.appendChild(item);
        return;
    }
    
    const isEmpty = Object.keys(files).every(category => 
        files[category].js.length === 0 && files[category].css.length === 0
    );
    
    if (!files || isEmpty) {
        const item = document.createElement("li");
        item.textContent = "No files found";
        list.appendChild(item);
        return;
    }
    
    // Count duplicates for the summary.
    let duplicateCount = 0;
    Object.keys(files).forEach(category => {
        ['js', 'css'].forEach(type => {
            files[category][type].forEach(file => {
                if (file.duplicate) duplicateCount++;
            });
        });
    });
    
    // Display a duplicate summary when needed.
    if (duplicateCount > 0) {
        const duplicateWarning = document.createElement("div");
        duplicateWarning.className = "duplicate-warning";
        const strong = document.createElement("strong");
        strong.textContent = `${duplicateCount} file${duplicateCount > 1 ? 's' : ''} loaded more than once`;
        duplicateWarning.append("Warning: ", strong, " (possible bug)");
        list.parentNode.insertBefore(duplicateWarning, list);
    }
    
    // Display plugin files.
    if (files.plugins.js.length > 0 || files.plugins.css.length > 0) {
        const pluginsHeader = document.createElement("li");
        pluginsHeader.appendChild(createStrongLabel("Plugin files:"));
        list.appendChild(pluginsHeader);
        
        // Group by plugin.
        const pluginGroups = {};
        
        // Process JS files.
        files.plugins.js.forEach(item => {
            if (!pluginGroups[item.plugin]) {
                pluginGroups[item.plugin] = { js: [], css: [] };
            }
            pluginGroups[item.plugin].js.push(item);
        });
        
        // Process CSS files.
        files.plugins.css.forEach(item => {
            if (!pluginGroups[item.plugin]) {
                pluginGroups[item.plugin] = { js: [], css: [] };
            }
            pluginGroups[item.plugin].css.push(item);
        });
        
        // Display each plugin.
        Object.keys(pluginGroups).forEach(pluginName => {
            const pluginHeader = document.createElement("li");
            const label = document.createElement("em");
            label.textContent = `Plugin: ${pluginName}`;
            pluginHeader.appendChild(label);
            list.appendChild(pluginHeader);
            
            // Display JS files.
            pluginGroups[pluginName].js.forEach(file => displayFile(file, "js"));
            
            // Display CSS files.
            pluginGroups[pluginName].css.forEach(file => displayFile(file, "css"));
        });
    }
    
    // Display a file row.
    function displayFile(file, type) {
        const li = document.createElement("li");
        li.textContent = file.displayPath || file.path;
        li.className = file.duplicate ? `${type}-file duplicate` : `${type}-file`;
        
        if (file.duplicate) {
            // Create a detailed tooltip for duplicates.
            let variantsText = "Loaded variants:\n";
            file.variants.forEach(variant => {
                variantsText += `- ${formatFileForDisplay(variant, file.pageOrigin)}\n`;
            });
            
            li.setAttribute("title", variantsText);
            li.append(" ");
            const duplicateCount = document.createElement("span");
            duplicateCount.className = "duplicate-count";
            duplicateCount.textContent = `(${file.count}×)`;
            li.appendChild(duplicateCount);
            
            // Add a button to show variants.
            const detailsBtn = document.createElement("button");
            detailsBtn.textContent = "Details";
            detailsBtn.className = "details-btn";
            detailsBtn.onclick = function() {
                // Check whether details are already displayed.
                const nextElement = li.nextElementSibling;
                if (nextElement && nextElement.classList.contains('variants-list')) {
                    nextElement.remove();
                    detailsBtn.textContent = "Details";
                } else {
                    // Create the variants list.
                    const variantsList = document.createElement("ul");
                    variantsList.className = "variants-list";
                    
                    file.variants.forEach(variant => {
                        const variantLi = document.createElement("li");
                        variantLi.textContent = formatFileForDisplay(variant, file.pageOrigin);
                        variantsList.appendChild(variantLi);
                    });
                    
                    li.insertAdjacentElement('afterend', variantsList);
                    detailsBtn.textContent = "Hide";
                }
            };
            
            li.appendChild(detailsBtn);
        }
        
        if (type === 'js' || type === 'css') {
            li.style.marginLeft = "20px";
        }
        
        list.appendChild(li);
    }
    
    // Display a file category.
    function displayCategory(category, title) {
        if (files[category].js.length > 0 || files[category].css.length > 0) {
            const header = document.createElement("li");
            header.appendChild(createStrongLabel(`${title}:`));
            list.appendChild(header);
            
            // Display JS files.
            files[category].js.forEach(file => displayFile(file, "js"));
            
            // Display CSS files.
            files[category].css.forEach(file => displayFile(file, "css"));
        }
    }
    
    // Display other categories.
    displayCategory('theme', 'Theme files');
    displayCategory('wordpress', 'WordPress core files');
    displayCategory('other', 'Other files');
}

function createStrongLabel(text) {
    const strong = document.createElement("strong");
    strong.textContent = text;
    return strong;
}

function formatFileForDisplay(fileUrl, pageOrigin = location.origin) {
    try {
        const url = new URL(fileUrl);
        if (url.origin === pageOrigin) {
            return `${url.pathname}${url.search}`;
        }

        return fileUrl;
    } catch (error) {
        return fileUrl;
    }
}
