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
