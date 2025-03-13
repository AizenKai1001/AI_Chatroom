// client.js - Front-end script for AI Chat Experience with analytics integration
document.addEventListener("DOMContentLoaded", () => {
  const chatMessages = document.getElementById("chatMessages");
  const messageInput = document.getElementById("messageInput");
  const sendButton = document.getElementById("sendButton");
  const statusMessage = document.getElementById("statusMessage");
  const imageUpload = document.getElementById("imageUpload");
  const imagePreview = document.getElementById("imagePreview");
  const imagePreviewContainer = document.getElementById(
    "imagePreviewContainer"
  );
  const removeImage = document.getElementById("removeImage");
  const floatingShapes = document.querySelector(".floating-shapes");
  const themeToggle = document.getElementById("checkbox");

  // Initialize Dark Mode
  initTheme();

  // Add floating shapes to header
  createFloatingShapes();

  // Keep track of conversation
  let conversationHistory = [
    {
      role: "assistant",
      content:
        "Hello! I'm your AI assistant. I can answer questions and analyze images. Try uploading a photo!",
    },
  ];

  // Selected image file
  let selectedImageFile = null;

  // Theme handling function
  function initTheme() {
    // Check for saved theme preference or use system preference
    const savedTheme = localStorage.getItem("theme");

    if (savedTheme === "dark") {
      document.body.classList.add("dark-mode");
      themeToggle.checked = true;
    } else if (savedTheme === "light") {
      document.body.classList.add("light-mode");
      themeToggle.checked = false;
    } else {
      // No preference saved, use system preference
      const prefersDarkMode = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      if (prefersDarkMode) {
        document.body.classList.add("dark-mode");
        themeToggle.checked = true;
      }
    }
  }

  // Create floating shapes in header
  function createFloatingShapes() {
    for (let i = 0; i < 15; i++) {
      const shape = document.createElement("div");
      shape.classList.add("shape");

      // Random size between 10px and 60px
      const size = Math.random() * 50 + 10;
      shape.style.width = `${size}px`;
      shape.style.height = `${size}px`;

      // Random position
      shape.style.top = `${Math.random() * 100}%`;
      shape.style.left = `${Math.random() * 100}%`;

      // Random opacity
      shape.style.opacity = Math.random() * 0.5 + 0.1;

      // Random animation duration
      shape.style.animationDuration = `${Math.random() * 10 + 5}s`;
      shape.style.animationDelay = `${Math.random() * 5}s`;

      floatingShapes.appendChild(shape);
    }
  }

  // Show status message
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = "block";

    // Clear any existing timeouts
    if (statusMessage.timeoutId) {
      clearTimeout(statusMessage.timeoutId);
    }

    // Hide after 5 seconds
    statusMessage.timeoutId = setTimeout(() => {
      // Fade out animation
      statusMessage.style.opacity = "0";
      statusMessage.style.transform = "translateY(20px)";

      // Hide after animation completes
      setTimeout(() => {
        statusMessage.style.display = "none";
        // Reset for next time
        statusMessage.style.opacity = "";
        statusMessage.style.transform = "";
      }, 300);
    }, 5000);
  }

  // Add message to chat
  function addMessage(text, sender, imageUrl = null) {
    const message = document.createElement("div");
    message.classList.add("message");
    message.classList.add(sender === "user" ? "user-message" : "ai-message");
    message.classList.add("animate__animated");
    message.classList.add(
      sender === "user" ? "animate__slideInRight" : "animate__slideInLeft"
    );
    message.classList.add("animate__faster");

    // If there's an image, add it
    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = "Uploaded image";
      img.classList.add("message-image");
      img.addEventListener("click", () => {
        // Open image in a new tab when clicked
        window.open(imageUrl, "_blank");
      });
      message.appendChild(img);
    }

    message.appendChild(document.createTextNode(text));

    const timeSpan = document.createElement("span");
    timeSpan.classList.add("message-time");
    timeSpan.textContent = "Now";
    message.appendChild(timeSpan);

    chatMessages.appendChild(message);
    chatMessages.scrollTo({
      top: chatMessages.scrollHeight,
      behavior: "smooth",
    });
  }

  // Show typing indicator
  function showTypingIndicator() {
    const indicator = document.createElement("div");
    indicator.classList.add("typing-indicator");
    indicator.id = "typingIndicator";
    indicator.classList.add(
      "animate__animated",
      "animate__fadeIn",
      "animate__faster"
    );

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("div");
      dot.classList.add("typing-dot");
      indicator.appendChild(dot);
    }

    chatMessages.appendChild(indicator);
    chatMessages.scrollTo({
      top: chatMessages.scrollHeight,
      behavior: "smooth",
    });
  }

  // Remove typing indicator
  function removeTypingIndicator() {
    const indicator = document.getElementById("typingIndicator");
    if (indicator) {
      indicator.classList.add("animate__fadeOut");
      setTimeout(() => {
        indicator.remove();
      }, 300);
    }
  }

  // Send text message
  async function sendTextMessage() {
    const messageText = messageInput.value.trim();
    if (messageText === "") return;

    // Add user message to chat
    addMessage(messageText, "user");

    // Track user message in analytics
    if (window.AnalyticsModule) {
      window.AnalyticsModule.trackUserMessage(messageText);
    }

    // Clear input and focus
    messageInput.value = "";
    messageInput.focus();

    // Add to conversation history
    conversationHistory.push({ role: "user", content: messageText });

    // Show typing indicator
    showTypingIndicator();

    try {
      // Animate send button
      sendButton.classList.add("animate__animated", "animate__rubberBand");
      setTimeout(() => {
        sendButton.classList.remove("animate__animated", "animate__rubberBand");
      }, 1000);

      // Call our backend API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-pro",
          max_tokens: 1000,
          messages: conversationHistory,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      const data = await response.json();

      // Remove typing indicator
      removeTypingIndicator();

      // Get the response text
      let responseText = "";
      if (
        data.content &&
        data.content.length > 0 &&
        data.content[0].type === "text"
      ) {
        responseText = data.content[0].text;
      } else {
        responseText = "I'm sorry, I received an unexpected response format.";
      }

      // Add AI response to conversation
      conversationHistory.push({ role: "assistant", content: responseText });

      // Display AI response
      addMessage(responseText, "ai");

      // Track AI response in analytics
      if (window.AnalyticsModule) {
        window.AnalyticsModule.trackAIResponse(responseText);
      }
    } catch (error) {
      console.error("Error communicating with server:", error);
      removeTypingIndicator();

      addMessage(
        "I'm sorry, I encountered an error communicating with the server. Please try again.",
        "ai"
      );
      showStatus(`Error: ${error.message}`, "error");
    }
  }

  // Send image for analysis
  async function sendImageForAnalysis() {
    if (!selectedImageFile) {
      showStatus("Please select an image first", "error");
      return;
    }

    const messageText = messageInput.value.trim() || "What's in this image?";

    // Create form data
    const formData = new FormData();
    formData.append("image", selectedImageFile);
    formData.append("prompt", messageText);

    // Add user message with image to chat
    addMessage(messageText, "user", URL.createObjectURL(selectedImageFile));
    messageInput.value = "";

    // Track user message in analytics
    if (window.AnalyticsModule) {
      window.AnalyticsModule.trackUserMessage(messageText);
    }

    // Clear image preview
    clearImagePreview();

    // Show typing indicator
    showTypingIndicator();

    try {
      // Animate send button
      sendButton.classList.add("animate__animated", "animate__rubberBand");
      setTimeout(() => {
        sendButton.classList.remove("animate__animated", "animate__rubberBand");
      }, 1000);

      // Call our image analysis endpoint
      const response = await fetch("/api/analyze-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      const data = await response.json();

      // Remove typing indicator
      removeTypingIndicator();

      // Get the response text
      let responseText = "";
      if (
        data.content &&
        data.content.length > 0 &&
        data.content[0].type === "text"
      ) {
        responseText = data.content[0].text;
      } else {
        responseText = "I'm sorry, I received an unexpected response format.";
      }

      // Display AI response
      addMessage(responseText, "ai");

      // Track AI response in analytics
      if (window.AnalyticsModule) {
        window.AnalyticsModule.trackAIResponse(responseText);
      }

      // Show success message
      showStatus("Image analyzed successfully", "success");
    } catch (error) {
      console.error("Error analyzing image:", error);
      removeTypingIndicator();

      addMessage(
        "I'm sorry, I encountered an error analyzing the image. Please try again.",
        "ai"
      );
      showStatus(`Error: ${error.message}`, "error");
    }
  }

  // Handle image upload
  function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Check if it's an image
    if (!file.type.match("image.*")) {
      showStatus("Please select an image file", "error");
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showStatus("Image size should be less than 5MB", "error");
      return;
    }

    // Save the file
    selectedImageFile = file;

    // Track image upload in analytics
    if (window.AnalyticsModule) {
      window.AnalyticsModule.trackImageUpload();
    }

    // Show image preview
    imagePreview.src = URL.createObjectURL(file);
    imagePreviewContainer.style.display = "block";

    // Focus on message input
    messageInput.focus();
    messageInput.placeholder = "Ask about this image or just press send...";
  }

  // Clear image preview
  function clearImagePreview() {
    imagePreviewContainer.style.display = "none";
    imagePreview.src = "#";
    selectedImageFile = null;
    messageInput.placeholder = "Type your message here...";

    // Reset the file input
    imageUpload.value = "";
  }

  // Handle send button click
  function handleSendClick() {
    if (selectedImageFile) {
      sendImageForAnalysis();
    } else {
      sendTextMessage();
    }
  }

  // Handle theme toggle
  function switchTheme(e) {
    if (e.target.checked) {
      document.body.classList.remove("light-mode");
      document.body.classList.add("dark-mode");
      localStorage.setItem("theme", "dark");
    } else {
      document.body.classList.remove("dark-mode");
      document.body.classList.add("light-mode");
      localStorage.setItem("theme", "light");
    }

    // Update analytics charts for theme change
    if (window.AnalyticsModule) {
      window.AnalyticsModule.updateChartsTheme();
    }
  }

  // Event listeners
  sendButton.addEventListener("click", handleSendClick);

  messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent default form submission behavior
      handleSendClick();
    }
  });

  imageUpload.addEventListener("change", handleImageUpload);

  removeImage.addEventListener("click", clearImagePreview);

  themeToggle.addEventListener("click", switchTheme);

  // Set up analytics toggle
  const analyticsToggle = document.getElementById("analyticsToggle");
  if (analyticsToggle) {
    analyticsToggle.addEventListener("click", () => {
      if (window.AnalyticsModule) {
        window.AnalyticsModule.toggleAnalyticsPanel();
      }
    });
  }

  // Test connection to server
  fetch("/api/test")
    .then((response) => response.json())
    .then((data) => {
      console.log("Server response:", data);
      showStatus(`Connected to server: ${data.status}`, "success");
    })
    .catch((error) => {
      console.error("Couldn't connect to server:", error);
      showStatus("Warning: Couldn't connect to backend server", "error");
    });
});
