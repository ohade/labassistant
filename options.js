console.log('Options script loaded');

const defaultSettings = {
    apiKey: '',
    model: 'gpt-4o', // Keep consistent with HTML
    delay: 500,
    maxTokens: 1024,
    isEnabled: true, // Enable the extension by default
    keyCombinationDefault: 'Ctrl+Shift+A',
    keyCombinationMac: 'Command+Shift+A',
    systemPrompt: `You are an AI assistant that provides code completions for Python (especially pandas) and SQL in JupyterLab notebooks. Provide only the code completion, no explanations.`
};

// Function to save settings
function saveOptions() {
    console.log('Attempting to save options...');
    const apiKey = document.getElementById('apiKey').value;
    const delay = parseInt(document.getElementById('delay').value, 10);
    const maxTokens = parseInt(document.getElementById('maxTokens').value, 10);
    const systemPrompt = document.getElementById('systemPrompt').value;
    const isEnabled = document.getElementById('isEnabled').checked;
    const keyCombinationDefault = document.getElementById('keyCombinationDefault').value;
    const keyCombinationMac = document.getElementById('keyCombinationMac').value;

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
        isEnabled,
        keyCombinationDefault,
        keyCombinationMac,
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
             document.getElementById('isEnabled').checked = defaultSettings.isEnabled;
             document.getElementById('keyCombinationDefault').value = defaultSettings.keyCombinationDefault;
             document.getElementById('keyCombinationMac').value = defaultSettings.keyCombinationMac;
             document.getElementById('systemPrompt').value = defaultSettings.systemPrompt;
        } else {
            console.log('Loaded settings:', items);
            document.getElementById('apiKey').value = items.apiKey || ''; // Ensure empty string if null/undefined
            document.getElementById('delay').value = items.delay;
            document.getElementById('maxTokens').value = items.maxTokens;
            document.getElementById('isEnabled').checked = items.isEnabled !== undefined ? items.isEnabled : true;
            document.getElementById('keyCombinationDefault').value = items.keyCombinationDefault || defaultSettings.keyCombinationDefault;
            document.getElementById('keyCombinationMac').value = items.keyCombinationMac || defaultSettings.keyCombinationMac;
            document.getElementById('systemPrompt').value = items.systemPrompt;
            console.log('Options restored.');
            
            // Update the key combination display based on current settings
            updateKeyCombinationDisplay();
        }
    });
}

function setStatus(message) {
    const status = document.getElementById('status');
    status.textContent = message;
    console.log('Status update:', message);
}

// Function to update the key combination display based on platform and current settings
function updateKeyCombinationDisplay() {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const combinationElement = document.getElementById('keyCombinationDisplay');
    
    if (isMac) {
        const macCombination = document.getElementById('keyCombinationMac').value;
        combinationElement.textContent = macCombination;
    } else {
        const defaultCombination = document.getElementById('keyCombinationDefault').value;
        combinationElement.textContent = defaultCombination;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded.');
    restoreOptions();
    document.getElementById('save').addEventListener('click', saveOptions);
    
    // Update key combination display when inputs change
    document.getElementById('keyCombinationMac').addEventListener('input', updateKeyCombinationDisplay);
    document.getElementById('keyCombinationDefault').addEventListener('input', updateKeyCombinationDisplay);
});
