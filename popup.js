let apiKey;
let configData; // Declare this to hold the loaded JSON data.

// Load the API key when the popup is opened.
chrome.storage.sync.get('apiKey', (data) => {
  apiKey = data.apiKey || '';
  document.getElementById('api-key').value = apiKey;
});

// Load configurations when the popup is opened.
loadConfigurations().then(() => {
  // After configurations are loaded, get the team selection and set it.
  chrome.storage.sync.get('team', (data) => {
    const team = data.team || 'all';
    document.getElementById('team-selector').value = team;
    hideOptionsBasedOnTeam(team);
  });
});

async function loadConfigurations() {
  try {
    const response = await fetch("config.json");
    configData = await response.json(); // This line sets the global configData variable.

    // Populate the team selector
    let teamSelector = document.getElementById("team-selector");
    teamSelector.innerHTML = ''; // Clear current options
    configData.teamOptions.forEach(option => {
      let opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.text;
      teamSelector.appendChild(opt);
    });

    // Populate the role selector
    let roleSelector = document.getElementById("role-selector");
    roleSelector.innerHTML = ''; // Clear current options
    configData.roleOptions.forEach(option => {
      let opt = document.createElement("option");
      opt.value = option.value;
      opt.setAttribute("data-team", option['data-team']);
      opt.textContent = option.text;
      roleSelector.appendChild(opt);
    });
  } catch(err) {
    console.error("Error reading config.json", err);
  }
}

function hideOptionsBasedOnTeam(team) {
  // Get the select dropdown with the id 'role-selector'
  const roleSelector = document.getElementById('role-selector');

  // Get all option elements
  const options = roleSelector.querySelectorAll('option');
  
  // This will track the first visible option when filtering based on the team
  let firstVisibleOptionValue = null;

  options.forEach(option => {
    // If team is set to 'all', display all options and return early
    if (team === 'all') {
      option.style.display = '';
      if (firstVisibleOptionValue === null) firstVisibleOptionValue = option.value;
      return;
    }

    // Check the data-team attribute
    const optionTeam = option.getAttribute('data-team');

    if (optionTeam && optionTeam !== team) {
      // Hide option if the data-team doesn't match the given team
      option.style.display = 'none';
    } else {
      // Ensure that other options are visible if they match the team or if no data-team is set
      option.style.display = '';
      if (firstVisibleOptionValue === null) firstVisibleOptionValue = option.value;
    }
  });

  // Set the roleSelector value to the first visible option value
  roleSelector.value = firstVisibleOptionValue;
}


document.getElementById('team-selector').addEventListener('change', (e) => {
  hideOptionsBasedOnTeam(e.target.value);
});

document.getElementById('save-settings').addEventListener('click', () => {
  apiKey = document.getElementById('api-key').value;
  chrome.storage.sync.set({ apiKey });
  team = document.getElementById('team-selector').value;
  chrome.storage.sync.set({ team });
});

document.getElementById('settings-button').addEventListener('click', () => {
  const settings = document.getElementById('settings');
  settings.style.display = settings.style.display === 'none' ? 'block' : 'none';
});

document.querySelectorAll('input[name="input-option"]').forEach((elem) => {
  elem.addEventListener('change', () => {
    document.getElementById('input-text').style.display =
      document.querySelector('input[name="input-option"]:checked').value === 'enter'
        ? 'block'
        : 'none';
  });
});

document.getElementById('generate-response').addEventListener('click', async () => {
  document.getElementById('generate-response').disabled = true;
  const inputOption = document.querySelector('input[name="input-option"]:checked').value;
  let inputText;
  
  if (inputOption === 'highlight') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['getSelection.js'],
    });
    inputText = result.result;
  } else {
    inputText = document.getElementById('input-text').value;
  }

  if (!inputText) {
    document.getElementById('response-container').innerText =
      'Please highlight some text or enter some text before generating a response.';
    return;
  }

  const roleSelector = document.getElementById('role-selector');
  const selectedRole = roleSelector.value;

  // Use the stored configData to fetch the role instructions
  let selectedRoleConfig = configData.roleOptions.find(role => role.value === selectedRole);
  let systemRoleContent = selectedRoleConfig ? selectedRoleConfig.role_instructions : '';

  document.getElementById('spinner').style.display = 'block';

  try {
    const response = await getChatGPTResponse(inputText, systemRoleContent);
    document.getElementById('response-container').innerText = response;
    document.getElementById('copy-response').style.display = 'inline-block';
  } catch (error) {
    console.error(error);
    document.getElementById('response-container').innerText =
      'Error generating response. Please try again later.';
  } finally {
    document.getElementById('spinner').style.display = 'none';
  }

});

document.getElementById('copy-response').addEventListener('click', async () => {
  const responseText = document.getElementById('response-container').innerText;
  if (responseText) {
    await navigator.clipboard.writeText(responseText);
  }
});

async function getChatGPTResponse(prompt, systemRoleContent) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: systemRoleContent,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content.trim();
}
