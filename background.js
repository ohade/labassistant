console.log('%c Background Service Worker started at ' + new Date().toISOString(), 'background: #202124; color: #8ab4f8; padding: 2px 5px; border-radius: 2px;');

// Log extension initialization
chrome.runtime.onInstalled.addListener((details) => {
    console.log('%c Extension installed/updated', 'background: #202124; color: #8ab4f8; padding: 2px 5px; border-radius: 2px;');
    console.log('  Reason:', details.reason);
    console.log('  Previous version:', details.previousVersion);
    console.log('  Current version:', chrome.runtime.getManifest().version);
});


const defaultSettings = {
    apiKey: '',
    model: 'gpt-4o',
    delay: 250,
    maxTokens: 1024,
    isEnabled: true, // Enable the extension by default
    keyCombinationDefault: 'Ctrl+Shift+A',
    keyCombinationMac: 'Command+Shift+A',
    systemPrompt: "You are an AI assistant that provides code completions for Python (especially pandas) and SQL in Jupyter notebooks. VERY IMPORTANT: Provide ONLY the continuation text to be inserted where the user stopped typing. DO NOT repeat any of the existing code. DO NOT include markdown code block markers. Provide only plain text continuation that makes sense based on the existing code."
};

let lastSuggestionRequest = null; // Store info about the last request for command handling

// Helper function to remove markdown code blocks
function removeMarkdownCodeBlocks(text) {
    // Remove starting markdown code block markers
    text = text.replace(/^```\w*\s*\n?/im, '');
    // Remove ending markdown code block markers
    text = text.replace(/\n?```$/im, '');
    return text.trim();
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        console.log('Background received message:', request);
        console.log('Sender:', sender ? `Tab ID: ${sender.tab?.id}, URL: ${sender.tab?.url}` : 'No sender');

        if (!request) {
            console.error('Received empty request');
            return false;
        }

        if (request.type === 'getCodeSuggestion') {
            // Store sender info for potential command response later
            lastSuggestionRequest = { tabId: sender.tab?.id };
            console.log('Processing getCodeSuggestion for tab:', sender.tab?.id);
            
            // Validate request data
            if (!request.code) {
                console.warn('Received empty code in suggestion request');
                if (sender.tab?.id) {
                    sendErrorToContent(sender.tab.id, 'No code provided for suggestion.');
                }
                return false;
            }

            // Asynchronously fetch settings and then call API
            chrome.storage.local.get(defaultSettings, (settings) => {
                try {
                    if (chrome.runtime.lastError) {
                        console.error('Error getting settings in background:', chrome.runtime.lastError);
                        sendErrorToContent(sender.tab.id, 'Error retrieving extension settings.');
                        return;
                    }
                    console.log('Using settings:', settings);

                    // Check if extension is enabled
                    if (settings.isEnabled === false) {
                        console.log('Extension is currently disabled by user settings.');
                        return; // Don't proceed if extension is disabled
                    }
                    
                    if (!settings.apiKey) {
                        console.warn('API Key is missing.');
                        sendErrorToContent(sender.tab.id, 'OpenAI API Key not set in extension options.');
                        return; // Don't proceed without API key
                    }

                    callOpenAI(request.code, settings, sender.tab.id);
                } catch (err) {
                    console.error('Error in settings handling:', err);
                    if (sender.tab?.id) {
                        sendErrorToContent(sender.tab.id, `Error in extension: ${err.message}`);
                    }
                }
            });

            // Indicate that we will respond asynchronously (important for Manifest V3)
            return true;
        }
        // Handle other message types if needed - just return false to close the message channel
        return false;
    } catch (err) {
        console.error('Error handling message:', err);
        return false;
    }
});

async function callOpenAI(code, settings, tabId) {
    console.log(`Calling OpenAI for tab ${tabId}. Code length: ${code.length}, Max Tokens: ${settings.maxTokens}`);
    const apiUrl = 'https://api.openai.com/v1/chat/completions';

    try {
        // Log full request details for debugging
        const requestBody = {
            model: settings.model,
            messages: [
                { role: 'system', content: settings.systemPrompt },
                // Send the whole cell content with clear instructions about continuation
                { role: 'user', content: "Complete this code by providing ONLY the text to insert at the cursor position (where this text ends). Do not repeat any of the existing code.\n\n" + code }
            ],
            max_tokens: settings.maxTokens,
            temperature: 0.3, // Lower temperature for more deterministic code
            stop: ["\n\n", "\ndef ", "\nclass "] // Stop sequences to prevent overly long completions
        };
        
        console.log('API Request details:', {
            url: apiUrl,
            model: settings.model,
            systemPromptLength: settings.systemPrompt.length,
            codeLength: code.length,
            maxTokens: settings.maxTokens
        });

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        console.log('OpenAI API Response Status:', response.status);

        if (!response.ok) {
            // Try to parse the error response
            let errorData;
            try {
                errorData = await response.json();
            } catch (jsonError) {
                errorData = { error: { message: 'Failed to parse error response: ' + jsonError.message } };
            }
            
            console.error('OpenAI API Error:', response.status, errorData);
            const errorMessage = `API Error ${response.status}: ${errorData?.error?.message || response.statusText}`;
            sendErrorToContent(tabId, errorMessage);
            return;
        }

        // Parse the successful response
        let data;
        try {
            data = await response.json();
            console.log('OpenAI API Success Response:', data);
        } catch (jsonError) {
            console.error('Error parsing success response:', jsonError);
            sendErrorToContent(tabId, `Error parsing API response: ${jsonError.message}`);
            return;
        }

        if (data.choices && data.choices.length > 0 && data.choices[0].message) {
            let suggestion = data.choices[0].message.content.trim();
            // Basic check to avoid suggesting exactly what was typed or empty strings
            if (!suggestion) {
                console.warn('Empty suggestion received');
                return;
            }
            
            // Remove any markdown code block markers if present
            suggestion = removeMarkdownCodeBlocks(suggestion);
            
            // Check if the suggestion is just repeating the last line or code
            const lastCodeLine = code.slice(code.lastIndexOf('\n') + 1).trim();
            if (suggestion === lastCodeLine) {
                console.log('Suggestion matches last line of code, not sending:', suggestion);
                return;
            }
            
            // Check if suggestion contains any of the existing code lines
            const codeLines = code.split('\n');
            const isJustExistingCode = codeLines.some(line => {
                const trimmedLine = line.trim();
                return trimmedLine.length > 10 && suggestion.includes(trimmedLine);
            });
            
            if (isJustExistingCode && suggestion.length < code.length) {
                console.log('Suggestion appears to repeat existing code, not sending:', suggestion);
                return;
            }
            
            // Check if the original code contained markdown code block markers
            const markdownRegex = /```python|```jupyter|```sql|```bash|```/i;
            const originalContainedMarker = markdownRegex.test(code);
            console.log('Original code contained markdown markers:', originalContainedMarker);
            
            // Log what we're sending to help debug
            console.log('Sending suggestion to content script:', suggestion);
            
            try {
                await chrome.tabs.sendMessage(tabId, { 
                    type: 'suggestionResult', 
                    suggestion: suggestion,
                    originalContainedMarker: originalContainedMarker,
                    timestamp: Date.now() // Add timestamp for debugging
                });
                console.log('Suggestion successfully sent to tab', tabId);
            } catch (messagingError) {
                console.error('Error sending suggestion to tab:', messagingError);
                // The tab might be closed or not have the content script running
            }
        } else {
            console.warn('No usable choices found in API response:', data);
            // Consider informing the user that no suggestion was available
            sendErrorToContent(tabId, 'No suggestions available for this code.');
        }

    } catch (error) {
        console.error('Network or other error calling OpenAI:', error);
        sendErrorToContent(tabId, `Network Error: ${error.message}`);
    }
}

// Listen for the command to accept the suggestion
chrome.commands.onCommand.addListener((command) => {
    console.log(`Command received: ${command}`);
    // First check if extension is enabled before processing any commands
    chrome.storage.local.get({ isEnabled: true }, (settings) => {
        if (settings.isEnabled === false) {
            console.log('Command ignored - extension is disabled in settings');
            return;
        }
        
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
});

function sendErrorToContent(tabId, errorMessage) {
    console.log(`Sending error to tab ${tabId}: ${errorMessage}`);
    chrome.tabs.sendMessage(tabId, { type: 'suggestionError', error: errorMessage })
     .catch(error => console.warn(`Could not send error message to tab ${tabId}: ${error.message}. Tab might be closed.`));
}

// Keep service worker alive logic (optional, may help in some cases)
// chrome.runtime.onStartup.addListener(() => { console.log('Extension startup.'); });
// chrome.runtime.onInstalled.addListener(() => { console.log('Extension installed/updated.'); });
