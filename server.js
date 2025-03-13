// server.js - Backend server for AI Chat Experience with enhanced logging
const express = require("express");
const multer = require("multer");
const path = require("path");
const cors = require("cors");

// Logger utility function for better console output
const logger = {
  info: (message, ...args) => {
    console.log(`\x1b[36m[INFO]\x1b[0m ${message}`, ...args);
  },
  success: (message, ...args) => {
    console.log(`\x1b[32m[SUCCESS]\x1b[0m ${message}`, ...args);
  },
  warn: (message, ...args) => {
    console.log(`\x1b[33m[WARNING]\x1b[0m ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.log(`\x1b[31m[ERROR]\x1b[0m ${message}`, ...args);
  },
  userMessage: (message) => {
    console.log(`\x1b[35m[USER]\x1b[0m ${message}`);
  },
  aiResponse: (message) => {
    // Truncate long responses for console readability
    const displayMessage =
      message.length > 150 ? message.substring(0, 150) + "..." : message;
    console.log(`\x1b[32m[AI]\x1b[0m ${displayMessage}`);
  },
  debug: (message, ...args) => {
    console.log(`\x1b[90m[DEBUG]\x1b[0m ${message}`, ...args);
  },
};

// Load environment variables from .env file if it exists
try {
  require("dotenv").config();
  logger.info("Environment loaded from .env file");
} catch (err) {
  logger.info(
    "No .env file found or error loading it, using environment variables directly"
  );
}

// Better API key handling with detailed logging
function getApiKey() {
  const envKey = process.env.GOOGLE_API_KEY;
  const fallbackKey = "your-api-key-here"; // Replace this with your actual key if needed

  if (envKey) {
    // Mask the key for privacy in logs (show only first 4 and last 4 characters)
    const maskedKey =
      envKey.length > 8
        ? `${envKey.substring(0, 4)}...${envKey.substring(envKey.length - 4)}`
        : "****";
    logger.info(`Using API key from environment variable: ${maskedKey}`);

    // Basic validation check (not fully reliable but catches obvious issues)
    if (envKey.length < 10 || envKey === "your-api-key-here") {
      logger.warn(
        "The API key from environment looks suspicious (too short or default value)"
      );
    }

    return envKey;
  } else {
    logger.warn(
      "No API key found in environment variables, using fallback key"
    );

    if (fallbackKey === "your-api-key-here") {
      logger.error(
        "The fallback API key is still set to the default placeholder."
      );
      logger.error(
        "Please set a valid API key either as an environment variable or in the code."
      );
    }

    return fallbackKey;
  }
}

// Get API key with enhanced logging
const API_KEY = getApiKey();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads with detailed error handling
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (!file.mimetype.startsWith("image/")) {
      logger.error(
        `Rejected file upload: ${file.originalname} (${file.mimetype}) - Not an image`
      );
      return cb(new Error("Only image files are allowed!"), false);
    }

    logger.info(
      `Accepting file upload: ${file.originalname} (${file.mimetype})`
    );
    cb(null, true);
  },
}).single("image");

// Enhanced multer middleware with better error handling
const uploadMiddleware = (req, res, next) => {
  upload(req, res, function (err) {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        logger.error(`File upload rejected: File too large (max 5MB)`);
        return res.status(400).json({
          error: "File too large",
          details: "Maximum file size is 5MB",
        });
      }

      logger.error(`File upload error: ${err.message}`);
      return res.status(400).json({
        error: "File upload failed",
        details: err.message,
      });
    }

    // Check if file exists
    if (!req.file) {
      logger.warn("No file was uploaded with the request");
    } else {
      logger.success(
        `File "${req.file.originalname}" uploaded successfully (${req.file.size} bytes)`
      );
      logger.debug(
        `File details: ${JSON.stringify({
          fieldname: req.file.fieldname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          buffer_length: req.file.buffer.length,
        })}`
      );
    }

    next();
  });
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Log all incoming requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Configure generative AI
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(API_KEY);

// Available model information
let availableModels = {
  text: null, // Best available text model
  vision: null, // Best available vision model
  allModels: [], // List of all available models
};

// Function to discover available models with enhanced vision model detection
async function discoverAvailableModels() {
  try {
    logger.info("Discovering available Gemini models...");

    // Try to list models (this might not work with all API versions)
    try {
      const models = await genAI.listModels();
      if (models && models.models) {
        availableModels.allModels = models.models.map((m) => m.name);
        logger.info("Available models from API:", availableModels.allModels);
      }
    } catch (listError) {
      logger.warn("Could not list models from API:", listError.message);
      logger.info("Will try predefined model names instead");
    }

    // If model listing failed or returned empty, try predefined models
    if (availableModels.allModels.length === 0) {
      // List of potential model names to try, prioritizing vision models
      const potentialModels = [
        // Gemini Vision models (prioritized)
        "gemini-2.0-vision",
        "gemini-1.5-vision",
        "gemini-1.5-pro-vision",
        "gemini-pro-vision",
        "gemini-vision", // Generic name that might exist

        // Vision models from other generations
        "gemini-2.0-pro-vision",
        "gemini-ultra-vision",

        // Text models as fallback
        "gemini-2.0-flash",
        "gemini-2.0-pro",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-pro",
      ];

      logger.info(
        "Testing predefined model names (prioritizing vision models)..."
      );

      // Test each model with a simple prompt
      for (const modelName of potentialModels) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent("Test");
          // If we get here without an error, the model exists
          logger.success(`✅ Model '${modelName}' is available`);
          availableModels.allModels.push(modelName);

          // Categorize with enhanced logging
          if (modelName.includes("vision")) {
            if (!availableModels.vision) {
              availableModels.vision = modelName;
              logger.success(`🎯 Found vision model: ${modelName}`);
            } else {
              // If we already have a vision model but find a better one (newer version)
              if (isBetterModel(modelName, availableModels.vision)) {
                logger.info(
                  `Found potentially better vision model: ${modelName} (replacing ${availableModels.vision})`
                );
                availableModels.vision = modelName;
              }
            }
          } else {
            if (!availableModels.text) {
              availableModels.text = modelName;
              logger.success(`📝 Found text model: ${modelName}`);
            } else {
              // If we already have a text model but find a better one
              if (isBetterModel(modelName, availableModels.text)) {
                logger.info(
                  `Found potentially better text model: ${modelName} (replacing ${availableModels.text})`
                );
                availableModels.text = modelName;
              }
            }
          }
        } catch (error) {
          logger.debug(`Model '${modelName}' is not available:`, error.message);
        }
      }
    } else {
      // Process models returned by the API and prioritize vision models
      logger.info("Processing models returned by API...");

      // First pass: look specifically for vision models
      let visionModels = availableModels.allModels.filter((m) =>
        m.includes("vision")
      );
      if (visionModels.length > 0) {
        logger.success(
          `Found ${visionModels.length} vision models: ${visionModels.join(
            ", "
          )}`
        );

        // Sort vision models by preference (newer versions first)
        visionModels.sort((a, b) => {
          return getModelScore(b) - getModelScore(a);
        });

        // Select the best vision model
        availableModels.vision = visionModels[0];
        logger.success(
          `🔍 Selected best vision model: ${availableModels.vision}`
        );
      } else {
        logger.warn('No models with "vision" in the name were found');
      }

      // Process text models
      let textModels = availableModels.allModels.filter(
        (m) => !m.includes("vision")
      );
      if (textModels.length > 0) {
        logger.info(
          `Found ${textModels.length} text models: ${textModels.join(", ")}`
        );

        // Sort text models by preference
        textModels.sort((a, b) => {
          return getModelScore(b) - getModelScore(a);
        });

        // Select the best text model
        availableModels.text = textModels[0];
        logger.info(`Selected best text model: ${availableModels.text}`);
      }
    }

    // Show final models selected with clear formatting
    logger.success("\n==== SELECTED MODELS ====");
    logger.info(`Text model: ${availableModels.text || "None available"}`);
    logger.info(`Vision model: ${availableModels.vision || "None available"}`);
    logger.info("========================\n");

    // Log all detected models for reference
    logger.info("All available models:");
    availableModels.allModels.forEach((model, index) => {
      logger.info(`${index + 1}. ${model}`);
    });

    if (!availableModels.text && !availableModels.vision) {
      logger.error(
        "No working models found! API key may be invalid or service might be unavailable."
      );
      return false;
    }

    // Special emphasis if vision model was found
    if (availableModels.vision) {
      logger.success("✅ Vision model is available and ready to use!");
    } else {
      logger.warn(
        "⚠️ No vision model was found - image analysis will not be available"
      );
    }

    return true;
  } catch (error) {
    logger.error("Error discovering models:", error);
    return false;
  }
}

// Helper function to determine if one model is better than another
function isBetterModel(newModel, currentModel) {
  return getModelScore(newModel) > getModelScore(currentModel);
}

// Helper function to score models by presumed capability/generation
function getModelScore(modelName) {
  let score = 0;

  // Prioritize by generation
  if (modelName.includes("2.0")) score += 100;
  else if (modelName.includes("1.5")) score += 50;
  else if (modelName.includes("1.0")) score += 10;

  // Prioritize by capability tier
  if (modelName.includes("ultra")) score += 30;
  else if (modelName.includes("pro")) score += 20;
  else if (modelName.includes("flash")) score += 15;

  // Adjust for vision capability
  if (modelName.includes("vision")) score += 25;

  return score;
}

// Test the API key with a simple model check
async function testApiKey() {
  try {
    logger.info("Testing API key validity...");

    // Try to discover available models
    const modelsFound = await discoverAvailableModels();

    if (modelsFound) {
      logger.success("API key is valid! Successfully found Gemini models.");
      return true;
    } else {
      throw new Error("No working models found with the provided API key");
    }
  } catch (error) {
    logger.error("API key validation failed!");
    logger.error("Error details:", error.message);
    if (error.message.includes("API key not valid")) {
      logger.error("\n=================================================");
      logger.error("IMPORTANT: Your API key appears to be invalid.");
      logger.error("Please check the following:");
      logger.error(
        "1. Make sure you're using a valid Gemini API key from https://makersuite.google.com/app/apikey"
      );
      logger.error("2. Check if your API key has been rotated or expired");
      logger.error("3. Verify that the API key has the correct permissions");
      logger.error(
        "4. Ensure there are no extra spaces or characters in the key"
      );
      logger.error("=================================================\n");
    }
    return false;
  }
}

// Test endpoint
app.get("/api/test", (req, res) => {
  logger.info("API test endpoint called");
  res.json({
    status: "Server is running",
    timestamp: new Date().toISOString(),
    apiKeySet: API_KEY !== "your-api-key-here" && API_KEY.length > 10,
    availableModels: {
      text: availableModels.text || "None detected",
      vision: availableModels.vision || "None detected",
      allModels: availableModels.allModels,
    },
  });
});

// Chat endpoint for text-based queries
app.post("/api/chat", async (req, res) => {
  try {
    const { model: requestedModel, messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      logger.warn("Invalid request: missing or invalid messages array");
      return res.status(400).json({ error: "Invalid messages format" });
    }

    logger.info(`Chat request received: ${messages.length} messages`);

    // Check if we have a working text model
    if (!availableModels.text) {
      logger.error("No working text model available");
      return res.status(503).json({
        error: "No working text model available",
        details: "The server could not find any working Gemini text models",
      });
    }

    // Use requested model, fallback to best available text model
    const modelName = requestedModel || availableModels.text;
    logger.info(`Using model: ${modelName}`);

    const genModel = genAI.getGenerativeModel({ model: modelName });

    // Format conversation history for Gemini
    const history = [];
    let prompt = "";

    // Get the last user message as the prompt
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (i < messages.length - 1) {
        history.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === "user") {
        prompt = msg.content;

        // Log user message
        logger.userMessage(prompt);
      }
    }

    logger.info(`Chat prompt: ${prompt.length} characters`);
    logger.info(`Conversation history: ${history.length} previous messages`);

    // Generate response
    logger.debug("Calling Gemini API...");
    const chat =
      history.length > 0
        ? genModel.startChat({ history })
        : genModel.startChat();

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text = response.text();

    // Log AI Response
    logger.aiResponse(text);

    logger.success(`Chat response generated: ${text.length} characters`);

    res.json({
      content: [{ type: "text", text }],
      model: modelName,
    });
  } catch (error) {
    logger.error("Error in chat endpoint:", error);

    // More detailed error handling
    let errorDetails = error.message;
    let statusCode = 500;

    if (error.message.includes("API key not valid")) {
      errorDetails =
        "Invalid API key. Please check your Gemini API key configuration.";
      statusCode = 401;
    } else if (error.message.includes("not found")) {
      errorDetails =
        "The requested model was not found. Please check your model name.";
      statusCode = 404;
    } else if (error.message.includes("quota")) {
      errorDetails =
        "API quota exceeded. Please try again later or check your usage limits.";
      statusCode = 429;
    }

    res.status(statusCode).json({
      error: "An error occurred while processing your request",
      details: errorDetails,
    });
  }
});

// Image analysis endpoint
app.post("/api/analyze-image", uploadMiddleware, async (req, res) => {
  try {
    // Enhanced logging for image analysis
    logger.info("==== IMAGE ANALYSIS REQUEST ====");

    if (!req.file) {
      logger.error("No image file in request");
      return res.status(400).json({ error: "No image uploaded" });
    }

    logger.info(
      `Image file: ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})`
    );

    // Check if we have a working vision model
    if (!availableModels.vision) {
      logger.error("No working vision model available");
      return res.status(503).json({
        error: "No working vision model available",
        details: "The server could not find any working Gemini vision models",
      });
    }

    const imageData = req.file.buffer;
    const prompt = req.body.prompt || "What's in this image?";

    // Log user message for image prompt
    logger.userMessage(`[IMAGE] ${prompt}`);

    logger.info(`Image analysis prompt: "${prompt}"`);
    logger.info(`Image size: ${imageData.length} bytes`);
    logger.info(`Using vision model: ${availableModels.vision}`);

    // Using the multimodal model for image analysis
    const model = genAI.getGenerativeModel({ model: availableModels.vision });

    // Convert buffer to base64
    logger.debug("Converting image to base64...");
    const imageBase64 = imageData.toString("base64");
    logger.debug(`Base64 image length: ${imageBase64.length} characters`);

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: req.file.mimetype,
      },
    };

    // Log extra details about the request
    logger.debug(`Request details: 
        - Image MIME type: ${req.file.mimetype}
        - Image original name: ${req.file.originalname}
        - Image buffer length: ${imageData.length}
        - Model being used: ${availableModels.vision}
        - Prompt length: ${prompt.length}`);

    logger.info("Sending image to Gemini API...");

    // Make the API call with more detailed error handling
    let result, response, text;
    try {
      result = await model.generateContent([prompt, imagePart]);
      response = await result.response;
      text = response.text();

      // Log AI Response for image
      logger.aiResponse(`[IMAGE ANALYSIS] ${text}`);

      logger.success(
        `Image analysis successful! Response: ${text.length} characters`
      );
    } catch (apiError) {
      logger.error("API call failed during image analysis");
      logger.error("API error details:", apiError);

      // Check for common image-specific issues
      if (apiError.message.includes("exceeds the maximum size")) {
        throw new Error(
          "Image size too large for the API. Please use a smaller image."
        );
      } else if (apiError.message.includes("not supported")) {
        throw new Error(
          `Image format not supported. Supported formats include JPEG, PNG, WEBP, and GIF. Current format: ${req.file.mimetype}`
        );
      } else if (apiError.message.includes("image")) {
        throw new Error(`Image processing error: ${apiError.message}`);
      } else {
        // Re-throw the original error
        throw apiError;
      }
    }

    res.json({
      content: [{ type: "text", text }],
      model: availableModels.vision,
    });
  } catch (error) {
    logger.error("Error in image analysis endpoint:", error);

    // More detailed error handling
    let errorDetails = error.message;
    let statusCode = 500;

    if (error.message.includes("API key not valid")) {
      errorDetails =
        "Invalid API key. Please check your Gemini API key configuration.";
      statusCode = 401;
    } else if (error.message.includes("image")) {
      errorDetails = `Image processing error: ${error.message}`;
      statusCode = 400;
    } else if (error.message.includes("not found")) {
      errorDetails = "The vision model was not found or is not available.";
      statusCode = 404;
    } else if (error.message.includes("quota")) {
      errorDetails =
        "API quota exceeded. Please try again later or check your usage limits.";
      statusCode = 429;
    }

    res.status(statusCode).json({
      error: "An error occurred while processing your image",
      details: errorDetails,
    });
  }
});

// Detailed diagnostic endpoint
app.get("/api/diagnostics", (req, res) => {
  logger.info("Diagnostics endpoint called");

  // Gather system information
  const diagnostics = {
    server: {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      env: {
        NODE_ENV: process.env.NODE_ENV || "not set",
        PORT: PORT,
      },
    },
    api: {
      key_configured: API_KEY !== "your-api-key-here",
      key_length: API_KEY.length,
      models: availableModels,
    },
  };

  res.json(diagnostics);
});

// Fallback route for SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start the server
app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Visit http://localhost:${PORT} to view the application`);

  // Test the API key during startup
  const isValid = await testApiKey();
  if (!isValid) {
    logger.warn(
      "\n⚠️ Server started with invalid API key or no working models found!"
    );
    logger.warn("⚠️ Chat functionality will not work until this is resolved.");
    logger.warn("⚠️ Please check your API key and restart the server.\n");
  } else {
    logger.success("\n✅ Server started successfully with working models!");
  }
});
