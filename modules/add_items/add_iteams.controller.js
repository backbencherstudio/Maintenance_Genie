import dotenv from "dotenv";
import validator from "validator";
import { upload } from "../../config/Multer.config.js";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "jsonwebtoken";
import axios from "axios";

dotenv.config();

const prisma = new PrismaClient();
const { sign, verify } = pkg;
const { isEmail } = validator;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generateItemData = async (item) => {
  try {
    // Ensure correct formatting of the prompt to avoid issues with special characters.
    const serviceIntervalPrompt = `
      Based on the following item details, generate recommended service intervals:
      - Category: ${item.category || 'Unspecified'}
      - Brand: ${item.brand}
      - Model: ${item.model}
      - Total Mileage: ${item.total_mileage}
      - Purchase Date: ${item.purchase_date}
      Please provide a list of recommended service intervals (e.g., every X miles or every Y months).
    `;

    const forumSuggestionPrompt = `
      Based on the following item details, suggest related forums:
      - Category: ${item.category || 'Unspecified'}
      - Brand: ${item.brand}
      - Model: ${item.model}
      Please suggest 3-5 forum suggestions for discussions related to this item.
    `;

    // Request for service intervals
    const serviceIntervalResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.CHAT_GPT_MODEL_NAME || "gpt-3.5-turbo", // Make sure valid model is used
        messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: serviceIntervalPrompt }],
        max_tokens: 150,
      },
      {
        headers: { Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY}` },
      }
    );

    // Request for forum suggestions
    const forumSuggestionResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.CHAT_GPT_MODEL_NAME || "gpt-3.5-turbo", // Make sure valid model is used
        messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: forumSuggestionPrompt }],
        max_tokens: 150,
      },
      {
        headers: { Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY}` },
      }
    );

    // If forum suggestions are available
    let forumSuggestions = [];
    if (forumSuggestionResponse.data && forumSuggestionResponse.data.choices && forumSuggestionResponse.data.choices[0].message) {
      forumSuggestions = forumSuggestionResponse.data.choices[0].message.content.split("\n");
    }

    return {
      service_intervals: serviceIntervalResponse.data.choices[0].message.content.split("\n"),
      forum_suggestions: forumSuggestions,
    };
  } catch (error) {
    console.error("Error generating item data with Mistral:", error);
    return null;
  }
};
export const addItem = async (req, res) => {
  try {
    const {
      name,
      brand,
      model,
      vin,
      price,
      image_url,
      purchase_date,
      total_mileage,
      last_service_date,
      last_service_name,
      category,
    } = req.body;

    const formattedPurchaseDate = purchase_date ? new Date(purchase_date) : null;
    const formattedLastServiceDate = last_service_date ? new Date(last_service_date) : null;
    const mileage = total_mileage ? parseFloat(total_mileage) : null;

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { is_subscribed: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isSubscribed = user.is_subscribed;
    console.log("User subscription status:", isSubscribed);

    // Create the new item in the database
    const newItem = await prisma.item.create({
      data: {
        name,
        brand,
        model,
        vin,
        purchase_date: formattedPurchaseDate,
        total_mileage: mileage,
        last_service_date: formattedLastServiceDate,
        last_service_name,
        category,
        image_url: req.file ? req.file.filename : null,
        price,
        user_id: userId,
      },
    });

    console.log("New Item:", newItem);

    let generatedData;

    if (isSubscribed === true) {
      generatedData = await generateItemData(req.body);
    } else {
      const serviceIntervalPrompt = `
        Based on the following item details, generate recommended service intervals:
        - Category: ${category || 'Unspecified'}
        - Brand: ${brand}
        - Model: ${model}
        - Total Mileage: ${total_mileage}
        - Purchase Date: ${purchase_date}
        Please provide a list of recommended service intervals (e.g., every X miles or every Y months).
      `;

      const serviceIntervalResponse = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: process.env.CHAT_GPT_MODEL_NAME || "gpt-3.5-turbo",
          messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: serviceIntervalPrompt }],
          max_tokens: 150,
        },
        {
          headers: { Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY}` },
        }
      );

      generatedData = {
        service_intervals: serviceIntervalResponse.data.choices[0].message.content.split("\n"),
      };
    }

    if (generatedData) {
      const updatedItem = await prisma.item.update({
        where: { id: newItem.id },
        data: {
          service_intervals: generatedData.service_intervals,
          forum_suggestions: generatedData.forum_suggestions || [], // Ensure forum_suggestions is always an array
        },
      });

      const imageUrl = req.file ? `http://localhost:8070/uploads/${req.file.filename}` : null;

      return res.status(201).json({
        success: true,
        message: "Item added successfully with generated data",
        item: updatedItem,
        imageUrl,
      });
    } else {
      return res.status(500).json({ message: "Failed to generate additional data for item" });
    }
  } catch (error) {
    console.error("Error adding item:", error);

    // If there was a file upload error, delete the uploaded file
    if (req.file) {
      fs.unlinkSync(path.join(__dirname, "../../uploads", req.file.filename));
    }

    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};
export const generateQuestions = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ message: "Item not found" });

    const prompt = `
      Based on the following item details, generate 5 yes/no diagnostic questions about possible issues:
      - Category: ${item.category}
      - Brand: ${item.brand}
      - Model: ${item.model}
      - Last service: ${item.last_service_name || "Not available"}
      Please respond in JSON array format: ["Question 1?", "Question 2?", ...]
    `;

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.CHAT_GPT_MODEL_NAME || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY}`,
        },
      }
    );

    // 🧹 Clean GPT response if wrapped in markdown
    let raw = response.data.choices[0].message.content.trim();

    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
    }

    let questions;
    try {
      questions = JSON.parse(raw);
    } catch (err) {
      console.error("❌ Failed to parse questions JSON from GPT:", raw);
      return res.status(500).json({ message: "Invalid JSON response from AI" });
    }

    return res.json({ success: true, questions });
  } catch (error) {
    console.error("🔥 Error generating questions:", error);
    return res.status(500).json({ message: "Failed to generate questions" });
  }
};

export const generateTasks = async (req, res) => {
  try {
    const { id: taskId } = req.params;
    console.log("Task ID:", taskId);

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const { answers } = req.body;

    const item = await prisma.item.findUnique({ where: { id: taskId } });
    if (!item) return res.status(404).json({ message: "Item not found" });

    const user = await prisma.user.findUnique({
      where: { id: item.user_id },
      select: { is_subscribed: true },
    });

      if (!user.is_subscribed) {
        return res.json({
          success: false,
          message: "Oops, need subscription to create tasks",
        });
      }

    const prompt = `
      The user answered the following diagnostic questions with YES/NO:
      ${answers.join(", ")}
      Should any maintenance tasks be created for this ${item.category} (${item.brand} ${item.model})?
      If yes, generate up to 2 tasks with names, descriptions, and due dates.
      Respond in JSON format: [{ "task_name": "...", "description": "...", "due_in_days": 30 }]
      If no tasks are needed, respond with [].
    `;

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.CHAT_GPT_MODEL_NAME || "gpt-4-turbo",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY}`,
        },
      }
    );

    let raw = response.data.choices[0].message.content.trim();

    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
    }

    let tasks;
    try {
      tasks = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse tasks JSON from GPT:", raw);
      return res.status(500).json({ message: "Invalid JSON response from AI" });
    }

    if (!tasks.length) {
      return res.json({ success: true, message: "No tasks needed" });
    }

  

    const createdTasks = await Promise.all(
      tasks.map((t) =>
        prisma.tasks.create({
          data: {
            item_name: item.name,
            upcoming_task: t.task_name,
            description: t.description,
            last_date: new Date(
              Date.now() + t.due_in_days * 24 * 60 * 60 * 1000
            ),
            item: { connect: { id: item.id } },
            user: { connect: { id: item.user_id } },
          },
        })
      )
    );

    return res.json({ success: true, tasks: createdTasks });
  } catch (error) {
    console.error("Error generating tasks:", error);
    return res.status(500).json({ message: "Failed to generate tasks" });
  }
};




//GET ALL ITEMS
export const getAllItems = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const items = await prisma.item.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        category: true,
        name: true,
      },
    });

    if (items.length === 0) {
      return res.status(404).json({ message: "No items found for this user" });
    }

    return res.status(200).json({
      success: true,
      message: "Items retrieved successfully",
      items,
    });
  } catch (error) {
    console.error('Error retrieving items:', error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

//GET ITEM BY ID
export const getItemById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Item ID is required" });
    }

    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Append full image URL if it exists
    const formattedItem = {
      ...item,
      image_url: item.image_url ? `http://localhost:8070/uploads/${item.image_url}` : null,
    };

    return res.status(200).json({
      success: true,
      message: "Item retrieved successfully",
      item: formattedItem,
    });
  } catch (error) {
    console.error('Error retrieving item:', error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};
