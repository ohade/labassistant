Okay, let's implement the "Gemini JupyterLab Copilot" Chrome Extension based on our discussion.

This will involve creating several files:

manifest.json (Extension configuration)

options.html (Settings page UI)

options.js (Settings page logic)

options.css (Settings page styling - optional basic)

background.js (Service worker for API calls, command handling)

content.js (Injects into JupyterLab, handles UI/interaction)

content.css (Styling for suggestions and errors in JupyterLab)

Remember: This implementation makes some simplifying assumptions, especially around interacting perfectly with CodeMirror's internal state and positioning the suggestion overlay. Robust CodeMirror integration often requires more advanced techniques.

1. manifest.json

{
  "manifest_version": 3,
  "name": "Gemini JupyterLab Copilot",
  "version": "0.1.0",
  "description": "Provides AI code completions in JupyterLab using OpenAI.",
  "permissions": [
    "storage", // To save settings
    "activeTab" // Needed to message the correct content script from background
  ],
  "host_permissions": [
    "http://localhost:8888/lab*", // To inject content script
    "https://api.openai.com/"     // To allow background script to call API
  ],
  "options_page": "options.html",
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["http://localhost:8888/lab*"],
      "js": ["content.js"],
      "css": ["content.css"]
    }
  ],
  "commands": {
    "accept_suggestion": {
      "suggested_key": {
        "default": "Ctrl+Shift+A", // Changed default slightly for broader compatibility
        "mac": "Command+Shift+A"
      },
      "description": "Accept Copilot Suggestion"
    }
  },
  "action": {
      "default_title": "JupyterLab Copilot Settings",
      "default_popup": "options.html" // Make options easily accessible
  },
  "icons": {
     "16": "icon16.png",
     "48": "icon48.png",
    "128": "icon128.png"
  }
}


Note: You'll need to create placeholder icon16.png, icon48.png, and icon128.png files.

2. options.html

<!DOCTYPE html>
<html>
<head>
    <title>JupyterLab Copilot Settings</title>
    <link rel="stylesheet" href="options.css">
    <meta charset="utf-8">
</head>
<body>
    <h1>JupyterLab Copilot Settings</h1>

    <div class="setting">
        <label for="apiKey">OpenAI API Key:</label>
        <input type="password" id="apiKey" name="apiKey">
        <p class="note">Your API key is stored locally and only sent to OpenAI for code completions. <a href="https://platform.openai.com/account/api-keys" target="_blank">Get an API key</a></p>
    </div>

    <div class="setting">
        <label for="model">Model:</label>
        <input type="text" id="model" name="model" value="gpt-4o" disabled>
         <p class="note">Currently fixed to gpt-4o.</p>
    </div>

    <div class="setting">
        <label for="delay">Suggestion Delay (ms):</label>
        <input type="number" id="delay" name="delay" min="0" step="50">
    </div>

    <div class="setting">
        <label for="maxTokens">Maximum Tokens:</label>
        <input type="number" id="maxTokens" name="maxTokens" min="1" step="1">
    </div>

     <div class="setting">
        <label for="systemPrompt">System Prompt:</label>
        <textarea id="systemPrompt" name="systemPrompt" rows="5"></textarea>
    </div>

     <div class="setting">
         <label>Accept Suggestion:</label>
         <p class="note">Use the shortcut <strong id="shortcutDisplay">Ctrl+Shift+A</strong> (Windows/Linux) or <strong >Command+Shift+A</strong> (Mac). Configure in <a href="chrome://extensions/shortcuts" target="_blank">chrome://extensions/shortcuts</a>.</p>
     </div>


    <button id="save">Save Settings</button>
    <p id="status"></p>

    <script src="options.js"></script>
</body>
</html>
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Html
IGNORE_WHEN_COPYING_END

3. options.js

console.log('Options script loaded');

const defaultSettings = {
    apiKey: '',
    model: 'gpt-4o', // Keep consistent with HTML
    delay: 500,
    maxTokens: 1024,
    systemPrompt: `You are an AI assistant that provides code completions for Python (especially pandas) and SQL in JupyterLab notebooks. Provide only the code completion, no explanations.`
};

// Function to save settings
function saveOptions() {
    console.log('Attempting to save options...');
    const apiKey = document.getElementById('apiKey').value;
    const delay = parseInt(document.getElementById('delay').value, 10);
    const maxTokens = parseInt(document.getElementById('maxTokens').value, 10);
    const systemPrompt = document.getElementById('systemPrompt').value;

    // Basic validation
    if (isNaN(delay) || delay < 0) {
        setStatus('Error: Delay must be a non-negative number.');
        console.error('Invalid delay value:', document.getElementById('delay').value);
        return;
    }
    if (isNaN(maxTokens) || maxTokens < 1) {
        setStatus('Error: Max Tokens must be a positive number.');
         console.error('Invalid maxTokens value:', document.getElementById('maxTokens').value);
        return;
    }

    const settings = {
        apiKey,
        model: 'gpt-4o', // Hardcoded for now
        delay,
        maxTokens,
        systemPrompt
    };

    chrome.storage.local.set(settings, () => {
        if (chrome.runtime.lastError) {
            setStatus(`Error saving settings: ${chrome.runtime.lastError.message}`);
            console.error('Error saving settings:', chrome.runtime.lastError);
        } else {
            setStatus('Settings saved successfully!');
            console.log('Settings saved:', settings);
            setTimeout(() => setStatus(''), 2000); // Clear status after 2s
        }
    });
}

// Function to restore settings
function restoreOptions() {
    console.log('Attempting to restore options...');
    chrome.storage.local.get(defaultSettings, (items) => {
         if (chrome.runtime.lastError) {
            console.error('Error loading settings:', chrome.runtime.lastError);
            setStatus(`Error loading settings: ${chrome.runtime.lastError.message}`);
            // Still try to populate defaults
             document.getElementById('apiKey').value = defaultSettings.apiKey;
             document.getElementById('delay').value = defaultSettings.delay;
             document.getElementById('maxTokens').value = defaultSettings.maxTokens;
             document.getElementById('systemPrompt').value = defaultSettings.systemPrompt;
        } else {
            console.log('Loaded settings:', items);
            document.getElementById('apiKey').value = items.apiKey || ''; // Ensure empty string if null/undefined
            document.getElementById('delay').value = items.delay;
            document.getElementById('maxTokens').value = items.maxTokens;
            document.getElementById('systemPrompt').value = items.systemPrompt;
             console.log('Options restored.');
        }
    });
}

function setStatus(message) {
    const status = document.getElementById('status');
    status.textContent = message;
    console.log('Status update:', message);
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded.');
    restoreOptions();
    document.getElementById('save').addEventListener('click', saveOptions);
     // Optional: Display the correct shortcut based on OS (approximated)
     if (navigator.platform.toUpperCase().indexOf('MAC') >= 0) {
        document.getElementById('shortcutDisplay').textContent = 'Command+Shift+A';
     }
});
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
JavaScript
IGNORE_WHEN_COPYING_END

4. options.css (Basic Styling)

body {
    font-family: sans-serif;
    padding: 10px 20px;
    min-width: 400px; /* Prevent popup from being too narrow */
}

h1 {
    font-size: 1.5em;
    margin-bottom: 15px;
}

.setting {
    margin-bottom: 15px;
}

label {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
}

input[type="text"],
input[type="password"],
input[type="number"],
textarea {
    width: 95%;
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
}

textarea {
    resize: vertical;
    min-height: 60px;
}

button {
    padding: 10px 15px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1em;
}

button:hover {
    background-color: #0056b3;
}

.note {
    font-size: 0.85em;
    color: #555;
    margin-top: 5px;
}

#status {
    margin-top: 15px;
    font-weight: bold;
}
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Css
IGNORE_WHEN_COPYING_END

5. background.js

console.log('Background Service Worker started.');

const defaultSettings = {
    apiKey: '',
    model: 'gpt-4o',
    delay: 500,
    maxTokens: 1024,
    systemPrompt: `You are an AI assistant that provides code completions for Python (especially pandas) and SQL in JupyterLab notebooks. Provide only the code completion, no explanations.`
};

let lastSuggestionRequest = null; // Store info about the last request for command handling

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);

    if (request.type === 'getCodeSuggestion') {
        // Store sender info for potential command response later
        lastSuggestionRequest = { tabId: sender.tab.id };
        console.log('Processing getCodeSuggestion for tab:', sender.tab.id);

        // Asynchronously fetch settings and then call API
        chrome.storage.local.get(defaultSettings, (settings) => {
             if (chrome.runtime.lastError) {
                 console.error('Error getting settings in background:', chrome.runtime.lastError);
                 sendErrorToContent(sender.tab.id, 'Error retrieving extension settings.');
                 return;
             }
             console.log('Using settings:', settings);

            if (!settings.apiKey) {
                console.warn('API Key is missing.');
                sendErrorToContent(sender.tab.id, 'OpenAI API Key not set in extension options.');
                return; // Don't proceed without API key
            }

            callOpenAI(request.code, settings, sender.tab.id);
        });

        // Indicate that we will respond asynchronously (important for Manifest V3)
        return true;
    }
    // Handle other message types if needed
});

async function callOpenAI(code, settings, tabId) {
    console.log(`Calling OpenAI for tab ${tabId}. Code length: ${code.length}, Max Tokens: ${settings.maxTokens}`);
    const apiUrl = 'https://api.openai.com/v1/chat/completions';

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: settings.model,
                messages: [
                    { role: 'system', content: settings.systemPrompt },
                    // Send the whole cell content. The model should figure out completion.
                    // Future improvement: Indicate cursor position if needed/possible.
                    { role: 'user', content: code }
                ],
                max_tokens: settings.maxTokens,
                // temperature: 0.2, // Optional: lower temperature for more deterministic code
                stop: ["\n\n", "\ndef ", "\nclass "] // Optional: stop sequences might help prevent overly long/multi-part completions
            })
        });

        console.log('OpenAI API Response Status:', response.status);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: 'Failed to parse error response.' } }));
            console.error('OpenAI API Error:', response.status, errorData);
            const errorMessage = `API Error ${response.status}: ${errorData?.error?.message || response.statusText}`;
            sendErrorToContent(tabId, errorMessage);
            return;
        }

        const data = await response.json();
        console.log('OpenAI API Success Response:', data);

        if (data.choices && data.choices.length > 0 && data.choices[0].message) {
            const suggestion = data.choices[0].message.content.trim();
             // Basic check to avoid suggesting exactly what was typed or empty strings
             if (suggestion && suggestion !== code.slice(code.lastIndexOf('\n')+1) ) { // Don't suggest if it's just repeating the last line
                 console.log('Sending suggestion to content script:', suggestion);
                 chrome.tabs.sendMessage(tabId, { type: 'suggestionResult', suggestion: suggestion });
             } else {
                 console.log('Received empty or repetitive suggestion, not sending.');
             }

        } else {
            console.warn('No choices found in API response:', data);
            // Optionally send a "no suggestion" message or just do nothing
        }

    } catch (error) {
        console.error('Network or other error calling OpenAI:', error);
        sendErrorToContent(tabId, `Network Error: ${error.message}`);
    }
}

// Listen for the command to accept the suggestion
chrome.commands.onCommand.addListener((command) => {
    console.log(`Command received: ${command}`);
    if (command === 'accept_suggestion') {
        // Send message to the content script of the tab that last requested a suggestion
        if (lastSuggestionRequest && lastSuggestionRequest.tabId) {
             console.log(`Sending accept command to tab: ${lastSuggestionRequest.tabId}`);
             chrome.tabs.sendMessage(lastSuggestionRequest.tabId, { type: 'executeAcceptSuggestion' })
                 .catch(error => console.warn(`Could not send accept message to tab ${lastSuggestionRequest.tabId}: ${error.message}. Tab might be closed.`));
        } else {
             console.warn('Accept command received, but no target tab known.');
        }
    }
});

function sendErrorToContent(tabId, errorMessage) {
    console.log(`Sending error to tab ${tabId}: ${errorMessage}`);
    chrome.tabs.sendMessage(tabId, { type: 'suggestionError', error: errorMessage })
     .catch(error => console.warn(`Could not send error message to tab ${tabId}: ${error.message}. Tab might be closed.`));
}

// Keep service worker alive logic (optional, may help in some cases)
// chrome.runtime.onStartup.addListener(() => { console.log('Extension startup.'); });
// chrome.runtime.onInstalled.addListener(() => { console.log('Extension installed/updated.'); });
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
JavaScript
IGNORE_WHEN_COPYING_END

6. content.js

console.log("JupyterLab Copilot: Content script injected.");

let suggestionTimeout = null;
let currentSuggestion = null; // Store the suggestion text
let suggestionElement = null; // Store the DOM element for the suggestion
let lastActiveEditor = null; // Keep track of the editor we attached listeners to
let currentDelay = 500; // Default delay, will be updated from storage

// Function to remove existing suggestion element
function dismissSuggestion() {
    if (suggestionElement) {
        console.log("Dismissing suggestion.");
        suggestionElement.remove();
        suggestionElement = null;
        currentSuggestion = null;
    }
}

// Function to display the suggestion
// This is simplified - positioning might need significant work for robustness.
function displaySuggestion(suggestionText) {
    dismissSuggestion(); // Remove any old one
    if (!lastActiveEditor) {
        console.warn("Cannot display suggestion, no active editor known.");
        return;
    }

    console.log("Attempting to display suggestion:", suggestionText);
    currentSuggestion = suggestionText; // Store the text

    suggestionElement = document.createElement('span');
    suggestionElement.className = 'copilot-suggestion-overlay';
    // Basic multi-line handling (replace newline with <br>, use pre-wrap)
    suggestionElement.innerHTML = suggestionText.replace(/\n/g, '<br>');
    suggestionElement.style.whiteSpace = 'pre-wrap'; // Honor newlines and spaces

    // --- Positioning Attempt ---
    // Try to position it relative to the CodeMirror element.
    // This won't be perfectly inline with the cursor without deeper CM integration.
    const cmElement = lastActiveEditor; // Assuming lastActiveEditor is the CodeMirror wrapper
    const editorRect = cmElement.getBoundingClientRect();
    const cursorElement = cmElement.querySelector('.CodeMirror-cursor'); // Try to find CM cursor

    // Fallback positioning if cursor isn't found or for simplicity:
    // Position near the bottom right of the editor view? Or just append after?
    // Let's try appending *inside* the active cell, after the CodeMirror element.
    const activeCell = cmElement.closest('.jp-CodeCell.jp-mod-active');
    if (activeCell) {
        // Needs styling to position correctly relative to the text flow.
        // Append after the editor container within the cell.
        const editorContainer = cmElement.closest('.jp-Editor');
         if(editorContainer) {
             // We might need to insert it *within* the CodeMirror lines area
             // For now, append after editor. CSS will need absolute/relative positioning.
             editorContainer.parentNode.insertBefore(suggestionElement, editorContainer.nextSibling);
             console.log("Suggestion element appended after editor container.");
             // TODO: Add CSS to position this absolutely relative to the cursor/line end
         } else {
             console.warn("Could not find editor container to append suggestion relative to.");
             activeCell.appendChild(suggestionElement); // Fallback: append to cell end
         }

    } else {
        console.warn("Could not find active cell to append suggestion.");
        // Fallback: append to body, position fixed/absolute (less ideal)
        // document.body.appendChild(suggestionElement);
    }
     // --- End Positioning Attempt ---

     console.log("Suggestion displayed (positioning may be basic).");

}


// Function to show error banner
function showErrorBanner(errorMessage) {
    console.log("Showing error banner:", errorMessage);
    let banner = document.getElementById('copilot-error-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'copilot-error-banner';
        document.body.appendChild(banner);
    }
    banner.textContent = `JupyterLab Copilot Error: ${errorMessage}`;
    banner.style.display = 'block'; // Make sure it's visible

    // Fade out after a few seconds
    setTimeout(() => {
        banner.style.display = 'none';
        console.log("Hiding error banner.");
    }, 5000); // Hide after 5 seconds
}

// Function to handle keyup events in the editor
function handleKeyUp(event) {
    // Ignore modifier keys by themselves
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape'].includes(event.key)) {
        return;
    }

    // Clear existing suggestion timer and dismiss visual suggestion
    if (suggestionTimeout) {
        clearTimeout(suggestionTimeout);
    }
    dismissSuggestion(); // Dismiss on any typing

    // Start new timer
    suggestionTimeout = setTimeout(() => {
        if (!lastActiveEditor) return;

        console.log(`Typing stopped for ${currentDelay}ms. Requesting suggestion.`);
        // This is a simplified way to get content. Prefers CodeMirror API if accessible.
        const codeMirrorLines = lastActiveEditor.querySelectorAll('.CodeMirror-line');
        let currentCode = '';
        if (codeMirrorLines.length > 0) {
             currentCode = Array.from(codeMirrorLines).map(line => line.textContent).join('\n');
        } else {
             // Fallback if lines aren't found (less likely for CM)
            currentCode = lastActiveEditor.textContent;
        }


        if (currentCode) { // Only request if there's code
            console.log("Sending code to background:", currentCode.substring(0, 100) + "..."); // Log snippet
             chrome.runtime.sendMessage({ type: 'getCodeSuggestion', code: currentCode })
                 .catch(error => console.error("Error sending message to background:", error));
        } else {
             console.log("No code in editor, not requesting suggestion.");
        }

    }, currentDelay); // Use delay from settings
}


// Function to attempt inserting the suggestion
// Requires robust CodeMirror interaction - this is a placeholder.
function acceptSuggestion() {
    if (currentSuggestion && lastActiveEditor) {
        console.log("Attempting to accept suggestion:", currentSuggestion);

        // --- !! Ideal CodeMirror Integration Placeholder !! ---
        // This is where you would ideally call something like:
        // lastActiveEditor.CodeMirror.replaceSelection(currentSuggestion);
        // OR simulate the input events carefully.
        // Accessing `lastActiveEditor.CodeMirror` is often not possible directly
        // from content script due to isolated worlds. Needs advanced techniques
        // (script injection, postMessage) for robustness.
        // --- End Placeholder ---

        // Simple fallback: Log and maybe copy to clipboard?
        console.warn("CodeMirror interaction for insertion not implemented. Suggestion:", currentSuggestion);
        navigator.clipboard.writeText(currentSuggestion).then(() => {
             console.log("Suggestion copied to clipboard as fallback.");
             // Maybe show a small notification?
        }).catch(err => {
             console.error("Failed to copy suggestion to clipboard:", err);
        });


        dismissSuggestion(); // Clear the visual suggestion
    } else {
         console.log("No suggestion active to accept.");
    }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Content script received message:", request);
    if (request.type === 'suggestionResult') {
        displaySuggestion(request.suggestion);
    } else if (request.type === 'suggestionError') {
        showErrorBanner(request.error);
         dismissSuggestion(); // Dismiss any current suggestion on error
    } else if (request.type === 'executeAcceptSuggestion') {
        acceptSuggestion();
    }
});

// --- Editor Focus and Event Handling ---

// Debounce function to prevent rapid firing of focus checks
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


const checkFocus = debounce(() => {
    const activeElement = document.activeElement;
    // Check if focus is inside a CodeMirror instance within an active Jupyter code cell
    const codeMirrorEditor = activeElement?.closest('.jp-CodeCell.jp-mod-active .CodeMirror');

    if (codeMirrorEditor) {
        if (codeMirrorEditor !== lastActiveEditor) {
             // Detach from old editor if necessary
            if (lastActiveEditor) {
                console.log("Detaching listener from old editor.");
                lastActiveEditor.removeEventListener('keyup', handleKeyUp);
                lastActiveEditor.removeEventListener('focusout', handleFocusOut); // Add focusout handler
            }

             // Attach to new editor
            console.log("Detected focus in CodeMirror editor. Attaching listener.", codeMirrorEditor);
            lastActiveEditor = codeMirrorEditor;
            lastActiveEditor.addEventListener('keyup', handleKeyUp);
            lastActiveEditor.addEventListener('focusout', handleFocusOut); // Add focusout handler

             // Also dismiss suggestion if focus changes *between* editors
             dismissSuggestion();
        }
        // Else: Focus is still within the same editor, do nothing special
    } else {
        // Focus is not in a known code editor
        if (lastActiveEditor) {
            console.log("Focus lost from tracked editor.");
            // Don't detach listener immediately on blur, but clear suggestion
            dismissSuggestion();
            // We could detach here, but maybe user clicks back quickly.
            // Let focusin handle re-attaching.
            // lastActiveEditor.removeEventListener('keyup', handleKeyUp); // Reconsider detaching here
            // lastActiveEditor = null; // Maybe don't nullify immediately
        }
    }
}, 100); // Check focus shortly after events settle


// Handle focusout from the editor to dismiss suggestion
function handleFocusOut(event) {
     // Check if the new focused element is still within the same editor or related elements
     // Use setTimeout to allow focus to shift before checking
     setTimeout(() => {
         if (!lastActiveEditor?.contains(document.activeElement)) {
             console.log("Focus moved out of the editor, dismissing suggestion.");
             dismissSuggestion();
              // Maybe detach listener fully here?
              if (lastActiveEditor) {
                  lastActiveEditor.removeEventListener('keyup', handleKeyUp);
                  lastActiveEditor.removeEventListener('focusout', handleFocusOut);
                  lastActiveEditor = null;
                  console.log("Detached listener on focus out.");
              }
         }
     }, 0);
}


// Listen for focus changes anywhere in the document
document.addEventListener('focusin', checkFocus, true); // Use capture phase

// Also listen for clicks, as focus might not change if clicking within same editor
document.addEventListener('click', (event) => {
     // If the click is outside the suggestion and outside the editor, dismiss.
     if (suggestionElement && !suggestionElement.contains(event.target) &&
         lastActiveEditor && !lastActiveEditor.contains(event.target)) {
         console.log("Clicked outside editor/suggestion, dismissing.");
         dismissSuggestion();
     }
     // Re-check focus in case click landed in an editor
     checkFocus();
}, true); // Use capture phase


// --- Initial Setup ---

// Load delay setting initially
chrome.storage.local.get({ delay: 500 }, (items) => { // Load with default
     if (chrome.runtime.lastError) {
        console.error("Content Script: Error loading delay setting:", chrome.runtime.lastError);
     } else {
        currentDelay = items.delay;
        console.log(`Content Script: Initial suggestion delay set to ${currentDelay}ms.`);
     }
});

// Listen for changes in storage (e.g., user saves new settings)
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.delay) {
        currentDelay = changes.delay.newValue;
        console.log(`Content Script: Suggestion delay updated to ${currentDelay}ms.`);
    }
     // Could update other settings live if needed
});
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
JavaScript
IGNORE_WHEN_COPYING_END

7. content.css

/* Suggestion Overlay Styling */
.copilot-suggestion-overlay {
    /* Positioning is tricky - needs adjustment based on DOM structure */
    position: absolute; /* Position relative to nearest positioned ancestor */
    /* These values are placeholders - likely need dynamic calculation in JS */
     /* top: 50px; */
     /* left: 100px; */
    display: inline-block; /* Or block, depending on how it's inserted */
    background-color: rgba(230, 230, 230, 0.1); /* Very subtle background */
    color: grey;
    opacity: 0.75;
    padding: 0 2px; /* Minimal padding */
    border-radius: 3px;
    font-family: monospace; /* Match editor font */
    font-size: inherit; /* Inherit editor font size */
    pointer-events: none; /* Allow clicks to pass through */
    z-index: 10; /* Ensure it's above code but potentially below cursor/other UI */
    white-space: pre-wrap; /* Handle newlines correctly */
    /* Add more specific positioning styles if appending after editor */
    /* e.g., margin-top: -1.2em; /* Try to pull it up visually */
}

/* Error Banner Styling */
#copilot-error-banner {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    background-color: #dc3545; /* Red */
    color: white;
    padding: 10px 20px;
    text-align: center;
    z-index: 9999; /* Ensure it's on top */
    font-size: 1em;
    display: none; /* Hidden by default */
    box-sizing: border-box; /* Include padding in width */
}
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Css
IGNORE_WHEN_COPYING_END

How to Use:

Save Files: Create a folder (e.g., jupyterlab-copilot-ext) and save each code block above into files with the specified names (e.g., manifest.json, options.html, etc.) inside that folder.

Icons: Create or download some simple PNG icons named icon16.png, icon48.png, and icon128.png and place them in the folder.

Load Extension:

Open Chrome and go to chrome://extensions/.

Enable "Developer mode" (usually a toggle in the top right).

Click "Load unpacked".

Select the folder you created (jupyterlab-copilot-ext).

Configure:

Click the extension's icon in your Chrome toolbar (or find it in the Extensions menu).

Enter your valid OpenAI API key.

Adjust Delay, Max Tokens, and System Prompt if desired.

Click "Save Settings".

Test:

Make sure your local JupyterLab is running at http://localhost:8888/lab.

Open or create a notebook.

Click in a code cell.

Start typing Python code.

Pause typing for the configured delay (default 500ms).

Check the browser's Developer Console (F12 or Right-click -> Inspect -> Console) in the JupyterLab tab for extensive logs from content.js.

Check the extension's Service Worker console (Go to chrome://extensions/, find the extension, click the "Service Worker" link) for logs from background.js.

Look for a greyed-out suggestion to appear (its positioning might be imperfect).

Press Cmd+Shift+A (Mac) or Ctrl+Shift+A (Windows/Linux) to "accept" (currently logs and copies to clipboard).

If errors occur (e.g., invalid API key), look for the red banner at the top.

Important Considerations & Next Steps:

CodeMirror Interaction: The most significant limitation is the interaction with CodeMirror. Getting the exact cursor position and reliably inserting text requires more advanced techniques, likely involving injecting scripts into the page's main world context or using specific JupyterLab extension points if available. The current implementation uses basic DOM text extraction and a placeholder for insertion.

Suggestion Positioning: The CSS/JS for positioning the suggestion overlay is basic. Making it appear truly "inline" after the cursor like GitHub Copilot is complex and tightly coupled to the editor's rendering.

Context: Currently sends the whole cell. Implementing multi-cell context requires more logic in content.js to find previous cells and concatenate their content.

Error Handling: Error handling is basic. More specific error messages and UI feedback could be added.

Security: Storing API keys in chrome.storage.local is standard practice but be mindful of its security implications.

Performance: Extensive logging adds overhead. Consider reducing logging in a production version. The focus detection and event listeners might need optimization if performance issues arise.