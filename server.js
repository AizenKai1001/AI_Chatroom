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

// Enhanced model discovery function with better vision model detection
async function discoverAvailableModels() {
  try {
    logger.info("Discovering available Gemini models...");

    // Expanded list of vision models to test based on official documentation
    const visionModels = [
      // Gemini 2.0 vision models (newest)
      "gemini-2.0-vision",
      "gemini-2.0-pro-vision",

      // Gemini 1.5 vision models
      "gemini-1.5-pro-vision",
      "gemini-1.5-vision",
      "gemini-1.5-flash-vision",

      // Legacy Gemini vision models
      "gemini-pro-vision",
      "gemini-vision",

      // Flash/Pro variations that might support vision
      "gemini-2.0-flash", // Per docs, can handle multimodal inputs
      "gemini-1.5-pro", // Per docs, can handle multimodal inputs
      "gemini-1.5-flash", // Per docs, can handle multimodal inputs
    ];

    // Text-only models as fallback
    const textModels = [
      "gemini-2.0-pro",
      "gemini-2.0-flash",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "gemini-pro",
    ];

    // Combined list with vision models first
    const allPotentialModels = [...visionModels, ...textModels];

    // Try to list models from API first
    try {
      logger.info("Attempting to retrieve models directly from API...");
      const models = await genAI.listModels();
      if (models && models.models && models.models.length > 0) {
        availableModels.allModels = models.models.map((m) => m.name);
        logger.success(
          `Successfully retrieved ${availableModels.allModels.length} models from API`
        );

        // Identify vision models from the list
        identifyAndCategorizeModels(availableModels.allModels);
        return true;
      } else {
        logger.warn(
          "No models returned from API, falling back to predefined list"
        );
      }
    } catch (listError) {
      logger.warn(
        "Could not list models directly from API:",
        listError.message
      );
      logger.info("Falling back to testing predefined model names...");
    }

    // If we couldn't get the list from the API, test each model individually
    logger.info("Testing vision models first...");

    for (const modelName of allPotentialModels) {
      try {
        // Create a simple test prompt
        const model = genAI.getGenerativeModel({ model: modelName });

        // First test with text to see if the model exists
        const result = await model.generateContent("Test");
        const response = await result.response;

        // If we get here, the model exists
        logger.success(`✅ Model '${modelName}' is available`);
        availableModels.allModels.push(modelName);

        // Now test if the model supports image input (only for models not already known to be vision models)
        if (!modelName.includes("vision")) {
          try {
            logger.info(
              `Testing if ${modelName} supports vision/multimodal input...`
            );

            // Create a dummy image part (smallest possible valid base64 PNG)
            const minimalBase64Image =
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

            // Test if model accepts image as part
            const imagePart = {
              inlineData: {
                data: minimalBase64Image,
                mimeType: "image/png",
              },
            };

            // Send a test request with minimal image
            await model.generateContent(["Is this a test image?", imagePart]);

            // If we get here without error, model supports image input
            logger.success(
              `🎯 ${modelName} SUPPORTS VISION even without 'vision' in the name!`
            );

            // Consider this a vision model even though it doesn't have 'vision' in name
            if (!availableModels.vision) {
              availableModels.vision = modelName;
              logger.success(`Set ${modelName} as primary vision model`);
            }
          } catch (visionTestError) {
            // This model doesn't support vision input (expected for many models)
            logger.debug(
              `${modelName} does not support vision input: ${visionTestError.message}`
            );
          }
        } else {
          // Model has 'vision' in the name, so it should support image input
          if (!availableModels.vision) {
            availableModels.vision = modelName;
            logger.success(`Set ${modelName} as primary vision model`);
          }
        }

        // Categorize the model as text model if we don't have one yet
        if (!availableModels.text) {
          availableModels.text = modelName;
          logger.success(`Set ${modelName} as primary text model`);
        }

        // Always prefer newer generation models when available
        if (availableModels.vision && modelName.includes("vision")) {
          if (isBetterModel(modelName, availableModels.vision)) {
            logger.info(
              `Upgrading vision model from ${availableModels.vision} to ${modelName}`
            );
            availableModels.vision = modelName;
          }
        }

        if (isBetterModel(modelName, availableModels.text)) {
          logger.info(
            `Upgrading text model from ${availableModels.text} to ${modelName}`
          );
          availableModels.text = modelName;
        }
      } catch (error) {
        logger.debug(`Model '${modelName}' is not available: ${error.message}`);
      }
    }

    // Show final results
    logModelSelectionResults();

    return availableModels.allModels.length > 0;
  } catch (error) {
    logger.error("Error during model discovery:", error);
    return false;
  }
}

// Helper function to identify vision models from a list and categorize them
function identifyAndCategorizeModels(modelsList) {
  // First look for explicit vision models
  const explicitVisionModels = modelsList.filter((m) => m.includes("vision"));

  if (explicitVisionModels.length > 0) {
    logger.success(
      `Found ${
        explicitVisionModels.length
      } explicit vision models: ${explicitVisionModels.join(", ")}`
    );

    // Sort by score (prefer newer models)
    explicitVisionModels.sort((a, b) => getModelScore(b) - getModelScore(a));
    availableModels.vision = explicitVisionModels[0];
    logger.success(
      `Selected ${availableModels.vision} as primary vision model`
    );
  } else {
    logger.warn("No explicit vision models found in the API response");

    // Document mentions that some models like gemini-1.5-pro can handle multimodal even without "vision" in name
    // We'll need to test these separately
    const potentialMultimodalModels = modelsList.filter(
      (m) =>
        m.includes("1.5-pro") ||
        m.includes("1.5-flash") ||
        m.includes("2.0-flash") ||
        m.includes("2.0-pro")
    );

    if (potentialMultimodalModels.length > 0) {
      logger.info(
        `Found ${
          potentialMultimodalModels.length
        } potential multimodal models to test: ${potentialMultimodalModels.join(
          ", "
        )}`
      );
    }
  }

  // Find the best text model
  const allModels = [...modelsList]; // Create a copy
  allModels.sort((a, b) => getModelScore(b) - getModelScore(a));

  if (allModels.length > 0) {
    availableModels.text = allModels[0];
    logger.success(`Selected ${availableModels.text} as primary text model`);
  }
}

// Helper function to log the results of model selection
function logModelSelectionResults() {
  logger.success("\n==== SELECTED MODELS ====");
  logger.info(`Text model: ${availableModels.text || "None available"}`);
  logger.info(`Vision model: ${availableModels.vision || "None available"}`);
  logger.info("========================\n");

  // Log all detected models for reference
  logger.info("All available models:");
  availableModels.allModels.forEach((model, index) => {
    logger.info(`${index + 1}. ${model}`);
  });

  if (availableModels.vision) {
    logger.success("✅ Vision capabilities are AVAILABLE");
  } else {
    logger.error("❌ No vision model found - image analysis will NOT work");
    logger.warn(
      "Consider checking the API key permissions or enabling vision models in your Google AI account"
    );
  }
}

// Helper function to determine if one model is better than another
function isBetterModel(newModel, currentModel) {
  return getModelScore(newModel) > getModelScore(currentModel);
}

// Enhanced scoring function based on model documentation
function getModelScore(modelName) {
  let score = 0;

  // Generation scores
  if (modelName.includes("2.0")) score += 200;
  else if (modelName.includes("1.5")) score += 100;
  else if (modelName.includes("1.0")) score += 50;
  else score += 10; // Unknown/legacy model

  // Capability tier scores
  if (modelName.includes("pro")) score += 30;
  else if (modelName.includes("flash")) score += 20;

  // Vision capability (highest priority)
  if (modelName.includes("vision")) score += 100;

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
app.get('/api/test', (req, res) => {
    logger.info('API test endpoint called');
    res.json({
        status: 'Server is running',
        timestamp: new Date().toISOString(),
        apiKeySet: API_KEY !== 'your-api-key-here' && API_KEY.length > 10,
        availableModels: {
            text: availableModels.text || 'None detected',
            vision: availableModels.vision || 'None detected',
            allModels: availableModels.allModels
        }
    });
});

// Chat endpoint for text-based queries
app.post('/api/chat', async (req, res) => {
    try {
        const { model: requestedModel, messages } = req.body;
        
        if (!messages || !Array.isArray(messages)) {
            logger.warn('Invalid request: missing or invalid messages array');
            return res.status(400).json({ error: 'Invalid messages format' });
        }

        logger.info(`Chat request received: ${messages.length} messages`);
        
        // Check if we have a working text model
        if (!availableModels.text) {
            logger.error('No working text model available');
            return res.status(503).json({ 
                error: 'No working text model available',
                details: 'The server could not find any working Gemini text models'
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
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                });
            } else if (msg.role === 'user') {
                prompt = msg.content;
                
                // Log user message
                logger.userMessage(prompt);
            }
        }
        
        logger.info(`Chat prompt: ${prompt.length} characters`);
        logger.info(`Conversation history: ${history.length} previous messages`);
        
        // Generate response
        logger.debug('Calling Gemini API...');
        const chat = history.length > 0 ? 
            genModel.startChat({ history }) : 
            genModel.startChat();
        
        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Log AI Response
        logger.aiResponse(text);
        
        logger.success(`Chat response generated: ${text.length} characters`);
        
        res.json({
            content: [{ type: 'text', text }],
            model: modelName
        });
    } catch (error) {
        logger.error('Error in chat endpoint:', error);
        
        // More detailed error handling
        let errorDetails = error.message;
        let statusCode = 500;
        
        if (error.message.includes('API key not valid')) {
            errorDetails = 'Invalid API key. Please check your Gemini API key configuration.';
            statusCode = 401;
        } else if (error.message.includes('not found')) {
            errorDetails = 'The requested model was not found. Please check your model name.';
            statusCode = 404;
        } else if (error.message.includes('quota')) {
            errorDetails = 'API quota exceeded. Please try again later or check your usage limits.';
            statusCode = 429;
        }
        
        res.status(statusCode).json({ 
            error: 'An error occurred while processing your request',
            details: errorDetails
        });
    }
});

// Enhanced image analysis endpoint with better error handling and diagnostics
app.post('/api/analyze-image', uploadMiddleware, async (req, res) => {
    try {
        // Enhanced logging for image analysis
        logger.info('==== IMAGE ANALYSIS REQUEST ====');
        
        if (!req.file) {
            logger.error('No image file in request');
            return res.status(400).json({ error: 'No image uploaded' });
        }
        
        // Log detailed file information
        logger.info(`Image file: ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})`);
        
        // Check file size
        if (req.file.size > 20 * 1024 * 1024) {
            logger.warn('Image size exceeds 20MB - this may require using the File API instead of inline data');
        }
        
        // Verify file format is supported according to documentation
        const supportedFormats = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
        if (!supportedFormats.includes(req.file.mimetype)) {
            logger.warn(`Image format ${req.file.mimetype} is not in the officially supported list: ${supportedFormats.join(', ')}`);
            logger.warn('Proceeding anyway, but this might cause issues');
        }
        
        // Check if we have a working vision model
        if (!availableModels.vision) {
            logger.error('No working vision model available');
            
            // Detailed error message with troubleshooting steps
            return res.status(503).json({ 
                error: 'No working vision model available',
                details: 'The server could not find any working Gemini vision models. This could be due to:',
                troubleshooting: [
                    'Your API key might not have access to vision models',
                    'Vision models might not be available in your region',
                    'You might need to enable vision models in your Google AI Studio account',
                    'There might be a temporary outage of vision services'
                ]
            });
        }
        
        const imageData = req.file.buffer;
        const prompt = req.body.prompt || "What's in this image?";
        
        // Log user message for image prompt
        logger.userMessage(`[IMAGE] ${prompt}`);
        
        logger.info(`Image analysis prompt: "${prompt}"`);
        logger.info(`Image size: ${imageData.length} bytes`);
        logger.info(`Using vision model: ${availableModels.vision}`);
        
        // Initialize the model with safety settings following documentation
        const model = genAI.getGenerativeModel({ 
            model: availableModels.vision,
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                }
            ]
        });
        
        // Convert buffer to base64 - ensure proper encoding
        logger.debug('Converting image to base64...');
        const imageBase64 = Buffer.from(imageData).toString('base64');
        logger.debug(`Base64 image length: ${imageBase64.length} characters`);
        
        // Create image part following documentation format
        const imagePart = {
            inlineData: {
                data: imageBase64,
                mimeType: req.file.mimetype
            }
        };
        
        // Alternative approach to debug: Try a minimal known-working image
        const debugWithMinimalImage = false;
        
        if (debugWithMinimalImage) {
            logger.info('DEBUG MODE: Using minimal test image instead of uploaded image');
            // Smallest valid transparent PNG
            const minimalBase64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
            imagePart.inlineData.data = minimalBase64Image;
            imagePart.inlineData.mimeType = "image/png";
        }
        
        // Log additional diagnostic info
        logger.debug(`Request details: 
        - Image MIME type: ${req.file.mimetype}
        - Image original name: ${req.file.originalname}
        - Image buffer length: ${imageData.length}
        - Base64 encoded length: ${imagePart.inlineData.data.length}
        - Model being used: ${availableModels.vision}
        - Prompt length: ${prompt.length}`);
        
        logger.info('Sending image to Gemini API...');
        
        // Make the API call with more detailed error handling
        let result, response, text;
        
        try {
            // Per documentation, send both prompt and image part together
            // The prompt should come first for best results when using a single image
            result = await model.generateContent([prompt, imagePart]);
            response = await result.response;
            text = response.text();
            
            // Check if we got an empty response
            if (!text || text.trim() === '') {
                logger.warn('Received empty response from API, retrying with different approach...');
                
                // Try again with image first, then prompt (alternative approach)
                result = await model.generateContent([imagePart, prompt]);
                response = await result.response;
                text = response.text();
                
                if (!text || text.trim() === '') {
                    throw new Error('Received empty response from API even after retry');
                }
            }
            
            // Log AI Response for image
            logger.aiResponse(`[IMAGE ANALYSIS] ${text}`);
            
            logger.success(`Image analysis successful! Response: ${text.length} characters`);
        } catch (apiError) {
            logger.error('API call failed during image analysis');
            logger.error('API error details:', apiError);
            
            // Enhanced error categorization based on documentation
            if (apiError.message.includes('exceeds the maximum size')) {
                throw new Error('Image size too large. Per documentation, inline images should be under 20MB. For larger images, use the File API.');
            } else if (apiError.message.includes('not supported') || apiError.message.includes('invalid format')) {
                throw new Error(`Image format not supported. Supported formats include PNG, JPEG, WEBP, HEIC, and HEIF. Current format: ${req.file.mimetype}`);
            } else if (apiError.message.includes('blocked') || apiError.message.includes('safety')) {
                throw new Error('Content blocked by safety filters. The image may contain inappropriate content.');
            } else if (apiError.message.includes('not found') || apiError.message.includes('does not exist')) {
                throw new Error(`Model "${availableModels.vision}" not found or does not support vision. Try using a different model.`);
            } else if (apiError.message.includes('quota') || apiError.message.includes('rate limit')) {
                throw new Error('API quota or rate limit exceeded. Please try again later.');
            } else if (apiError.message.includes('permission')) {
                throw new Error('Permission denied. Your API key may not have access to vision models.');
            } else if (apiError.message.includes('invalid image')) {
                // Detailed logging for image encoding issues
                logger.error('Invalid image error - this might be a problem with image encoding');
                logger.error('Image Details:', {
                    size: req.file.size,
                    mimeType: req.file.mimetype, 
                    originalName: req.file.originalname,
                    bufferLength: req.file.buffer.length,
                    base64Length: imageBase64.length
                });
                throw new Error(`Invalid image: ${apiError.message}. Please try a different image format or encoding.`);
            } else {
                // Re-throw with additional diagnostic info
                throw new Error(`API error: ${apiError.message}`);
            }
        }
        
        res.json({
            content: [{ type: 'text', text }],
            model: availableModels.vision
        });
    } catch (error) {
        logger.error('Error in image analysis endpoint:', error);
        
        // Send detailed error response
        res.status(500).json({ 
            error: 'Image analysis failed',
            details: error.message,
            troubleshooting: [
                'Check that your API key has access to vision models',
                'Verify the image format is supported (PNG, JPEG, WEBP, HEIC, HEIF)',
                'Try a smaller or different image',
                'Make sure the image content complies with content safety policies'
            ]
        });
    }
});

// Detailed diagnostic endpoint
app.get('/api/diagnostics', (req, res) => {
    logger.info('Diagnostics endpoint called');
    
    // Gather system information
    const diagnostics = {
        server: {
            node_version: process.version,
            platform: process.platform,
            arch: process.arch,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            env: {
                NODE_ENV: process.env.NODE_ENV || 'not set',
                PORT: PORT
            }
        },
        api: {
            key_configured: API_KEY !== 'your-api-key-here',
            key_length: API_KEY.length,
            models: availableModels
        }
    };
    
    res.json(diagnostics);
});

// Fallback route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, async () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Visit http://localhost:${PORT} to view the application`);
    
    // Test the API key during startup
    const isValid = await testApiKey();
    if (!isValid) {
        logger.warn('\n⚠️ Server started with invalid API key or no working models found!');
        logger.warn('⚠️ Chat functionality will not work until this is resolved.');
        logger.warn('⚠️ Please check your API key and restart the server.\n');
    } else {
        logger.success('\n✅ Server started successfully with working models!');
        
        if (availableModels.vision) {
            logger.success('✅ Vision capability is AVAILABLE - image analysis should work');
        } else {
            logger.warn('⚠️ No vision models found - image analysis will NOT work');
            logger.info('   Visit http://localhost:${PORT}/api/diagnostics for troubleshooting');
        }
    }
});