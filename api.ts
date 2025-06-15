import { db } from "~/server/db";
import { getAuth, inviteUser, upload, getBaseUrl } from "~/server/actions";
import axios from "axios";
import { z } from "zod";

// Database health check utility with enhanced error handling
let dbHealthStatus: "unknown" | "healthy" | "unhealthy" | "missing" = "unknown";
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

async function checkDatabaseHealth(): Promise<boolean> {
  const now = Date.now();
  if (
    now - lastHealthCheck < HEALTH_CHECK_INTERVAL &&
    dbHealthStatus !== "unknown"
  ) {
    return dbHealthStatus === "healthy";
  }

  try {
    // Simple query to test database connectivity
    await db.$queryRaw`SELECT 1`;
    dbHealthStatus = "healthy";
    lastHealthCheck = now;
    consecutiveFailures = 0;
    return true;
  } catch (error: any) {
    consecutiveFailures++;
    lastHealthCheck = now;

    // Check if it's a database missing error (404)
    if (
      error?.message?.includes("404") ||
      error?.message?.includes("not found") ||
      error?.message?.includes("could not find database")
    ) {
      dbHealthStatus = "missing";
      console.error(
        "[Database Health Check] Database missing - infrastructure issue:",
        {
          error: error.message,
          consecutiveFailures,
          timestamp: new Date().toISOString(),
        },
      );
    } else {
      dbHealthStatus = "unhealthy";
      console.error("[Database Health Check] Database unhealthy:", {
        error: error.message,
        consecutiveFailures,
        timestamp: new Date().toISOString(),
      });
    }

    return false;
  }
}

// Enhanced wrapper for database operations with comprehensive error handling
async function safeDatabaseOperation<T>(
  operation: () => Promise<T>,
  fallbackValue: T,
  operationName?: string,
): Promise<T> {
  try {
    const isHealthy = await checkDatabaseHealth();
    if (!isHealthy) {
      const context = operationName ? ` for ${operationName}` : "";
      if (dbHealthStatus === "missing") {
        console.log(
          `[Database] Using fallback value${context} - database missing (infrastructure issue)`,
        );
      } else {
        console.log(
          `[Database] Using fallback value${context} - database unhealthy`,
        );
      }
      return fallbackValue;
    }
    return await operation();
  } catch (error: any) {
    const context = operationName ? ` for ${operationName}` : "";
    console.error(`[Database] Operation failed${context}, using fallback:`, {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      dbStatus: dbHealthStatus,
    });
    return fallbackValue;
  }
}

// Enhanced database initialization with better error handling
export async function initializeDatabase() {
  try {
    const isHealthy = await checkDatabaseHealth();
    if (!isHealthy) {
      return {
        success: false,
        error:
          dbHealthStatus === "missing"
            ? "Database infrastructure missing - contact Adaptive support"
            : "Database temporarily unavailable",
        requiresSupport: dbHealthStatus === "missing",
      };
    }

    // Try to run seed data if database is healthy
    await _seedInitialData();
    return { success: true, message: "Database initialized successfully" };
  } catch (error: any) {
    console.error("[Database Initialization] Failed:", error);
    return {
      success: false,
      error: error.message || "Unknown initialization error",
      requiresSupport:
        error.message?.includes("404") || error.message?.includes("not found"),
    };
  }
}

// Database health endpoint with enhanced diagnostics
export async function getDatabaseHealth() {
  const isHealthy = await checkDatabaseHealth();
  return {
    status: dbHealthStatus,
    healthy: isHealthy,
    lastCheck: new Date(lastHealthCheck).toISOString(),
    consecutiveFailures,
    needsInfrastructureSupport: dbHealthStatus === "missing",
    diagnostics: {
      canRetry:
        dbHealthStatus === "unhealthy" &&
        consecutiveFailures < MAX_CONSECUTIVE_FAILURES,
      requiresSupport:
        dbHealthStatus === "missing" ||
        consecutiveFailures >= MAX_CONSECUTIVE_FAILURES,
      message:
        dbHealthStatus === "missing"
          ? "База данных отсутствует. Обратитесь в службу поддержки Adaptive."
          : dbHealthStatus === "unhealthy"
            ? "Временные проблемы с подключением к базе данных."
            : "База данных работает нормально.",
    },
  };
}

// Auth and User Management
export async function getCurrentUser() {
  try {
    const auth = await getAuth({ required: false });
    if (auth.status !== "authenticated") return null;

    return await safeDatabaseOperation(
      () => db.user.findUnique({ where: { id: auth.userId } }),
      null,
    );
  } catch (error) {
    console.error("[getCurrentUser] Error:", error);
    return null;
  }
}

export async function createUserIfNotExists(input?: { role?: string }) {
  try {
    const auth = await getAuth({ required: true });

    return await safeDatabaseOperation(
      async () => {
        let user = await db.user.findUnique({
          where: { id: auth.userId },
        });

        if (!user) {
          user = await db.user.create({
            data: {
              id: auth.userId,
              role: input?.role || "EMPLOYEE",
            },
          });
        }

        return user;
      },
      {
        id: auth.userId,
        name: null,
        email: null,
        phone: null,
        role: input?.role || "EMPLOYEE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
  } catch (error) {
    console.error("[createUserIfNotExists] Error:", error);
    throw new Error(
      "Не удалось создать или получить пользователя. Проверьте подключение к базе данных.",
    );
  }
}

export async function updateUserProfile(input: {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}) {
  const auth = await getAuth({ required: true });

  const user = await db.user.update({
    where: { id: auth.userId },
    data: input,
  });

  return user;
}

export async function inviteNewUser(input: { email: string; role: string }) {
  const auth = await getAuth({ required: true });

  // Check if current user is a manager
  const currentUser = await db.user.findUnique({
    where: { id: auth.userId },
  });

  if (currentUser?.role !== "MANAGER") {
    throw new Error("Только руководители могут приглашать пользователей");
  }

  // Invite the user
  const newUser = await inviteUser({
    email: input.email,
    markdown: `
# Приглашение в КанбанПро

Вы были приглашены присоединиться к системе управления задачами КанбанПро.

[Нажмите здесь, чтобы принять приглашение](/settings)
    `,
    subject: "Приглашение в КанбанПро",
  });

  // Create user record with the specified role
  await db.user.create({
    data: {
      id: newUser.id,
      email: input.email,
      role: input.role,
    },
  });

  return { success: true };
}

export async function updateUserRole(input: { userId: string; role: string }) {
  const auth = await getAuth({ required: true });

  // Check if current user is a manager
  const currentUser = await db.user.findUnique({
    where: { id: auth.userId },
  });

  if (currentUser?.role !== "MANAGER") {
    throw new Error("Только руководители могут изменять роли пользователей");
  }

  const user = await db.user.update({
    where: { id: input.userId },
    data: { role: input.role },
  });

  return user;
}

export async function listUsers() {
  const auth = await getAuth({ required: true });

  // Check if current user is a manager
  const currentUser = await db.user.findUnique({
    where: { id: auth.userId },
  });

  if (currentUser?.role !== "MANAGER") {
    throw new Error(
      "Только руководители могут просматривать список пользователей",
    );
  }

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
  });

  return users;
}

// New endpoint for getting assignable users (accessible to all users)
export async function getAssignableUsers() {
  try {
    await createUserIfNotExists();

    return await safeDatabaseOperation(
      () =>
        db.user.findMany({
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
          orderBy: { name: "asc" },
        }),
      [], // Empty array fallback when database is unavailable
    );
  } catch (error) {
    console.error("[getAssignableUsers] Error:", error);
    return [];
  }
}

// Column Management
export async function listColumns() {
  try {
    await createUserIfNotExists();

    return await safeDatabaseOperation(
      async () => {
        const columns = await db.column.findMany({
          orderBy: { order: "asc" },
          include: {
            tasks: {
              include: {
                assignee: true,
              },
              orderBy: { updatedAt: "desc" },
            },
          },
        });

        // Sort tasks by priority within each column
        return columns.map((column) => ({
          ...column,
          tasks: column.tasks.sort((a, b) => {
            const priorityOrder = { red: 0, yellow: 1, green: 2 };
            const aPriority =
              priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
            const bPriority =
              priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
            return aPriority - bPriority;
          }),
        }));
      },
      // Enhanced fallback with sample tasks for better UX
      [
        {
          id: "fallback-1",
          name: "Задачи",
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          tasks: [
            {
              id: "sample-task-1",
              title: "Пример задачи",
              description: "Это пример задачи. База данных недоступна.",
              assigneeId: null,
              assignee: null,
              columnId: "fallback-1",
              createdAt: new Date(),
              updatedAt: new Date(),
              publishAt: null,
              publishTelegram: true,
              publishVkOk: true,
              publishWebsite: true,
              priority: "green",

              source: null,
              sourceUser: null,
            },
          ],
        },
        {
          id: "fallback-2",
          name: "В работе",
          order: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          tasks: [],
        },
        {
          id: "fallback-3",
          name: "Готово для проверки",
          order: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
          tasks: [],
        },
        {
          id: "fallback-4",
          name: "Готово к публикации",
          order: 4,
          createdAt: new Date(),
          updatedAt: new Date(),
          tasks: [],
        },
      ],
      "listColumns",
    );
  } catch (error: any) {
    console.error("[listColumns] Critical Error:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      dbStatus: dbHealthStatus,
    });

    // Don't throw error, return fallback instead to keep app functional
    return [
      {
        id: "error-fallback-1",
        name: "Задачи (Офлайн)",
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        tasks: [],
      },
      {
        id: "error-fallback-2",
        name: "В работе (Офлайн)",
        order: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        tasks: [],
      },
      {
        id: "error-fallback-3",
        name: "Готово для проверки (Офлайн)",
        order: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
        tasks: [],
      },
      {
        id: "error-fallback-4",
        name: "Готово к публикации (Офлайн)",
        order: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
        tasks: [],
      },
    ];
  }
}

export async function createColumn(input: { name: string }) {
  const auth = await getAuth({ required: true });

  // Check if current user is a manager
  const currentUser = await db.user.findUnique({
    where: { id: auth.userId },
  });

  if (currentUser?.role !== "MANAGER") {
    throw new Error("Только руководители могут создавать колонки");
  }

  // Get the highest order value
  const highestOrder = await db.column.findFirst({
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const newOrder = (highestOrder?.order || 0) + 1;

  const column = await db.column.create({
    data: {
      name: input.name,
      order: newOrder,
    },
  });

  return column;
}

export async function updateColumn(input: { id: string; name: string }) {
  const auth = await getAuth({ required: true });

  // Check if current user is a manager
  const currentUser = await db.user.findUnique({
    where: { id: auth.userId },
  });

  if (currentUser?.role !== "MANAGER") {
    throw new Error("Только руководители могут обновлять колонки");
  }

  const column = await db.column.update({
    where: { id: input.id },
    data: { name: input.name },
  });

  return column;
}

export async function deleteColumn(input: { id: string }) {
  const auth = await getAuth({ required: true });

  // Check if current user is a manager
  const currentUser = await db.user.findUnique({
    where: { id: auth.userId },
  });

  if (currentUser?.role !== "MANAGER") {
    throw new Error("Только руководители могут удалять колонки");
  }

  // Check if column has tasks
  const tasksCount = await db.task.count({
    where: { columnId: input.id },
  });

  if (tasksCount > 0) {
    throw new Error("Нельзя удалить колонку, содержащую задачи");
  }

  const column = await db.column.delete({
    where: { id: input.id },
  });

  return column;
}

// Task Management
export async function createTask(input: {
  title: string;
  description?: string;
  columnId: string;
  assigneeId?: string;
  publishAt?: string;
  publishTelegram?: boolean;
  publishVkOk?: boolean;
  publishWebsite?: boolean;
  priority?: string;
}) {
  await createUserIfNotExists();
  const auth = await getAuth({ required: true });

  const task = await db.task.create({
    data: {
      title: input.title,
      description: input.description || "",
      columnId: input.columnId,
      assigneeId: input.assigneeId || auth.userId,
      publishAt: input.publishAt ? new Date(input.publishAt) : null,
      publishTelegram:
        input.publishTelegram !== undefined ? input.publishTelegram : true,
      publishVkOk: input.publishVkOk !== undefined ? input.publishVkOk : true,
      publishWebsite:
        input.publishWebsite !== undefined ? input.publishWebsite : true,
      priority: input.priority || "green",
    },
    include: {
      assignee: true,
    },
  });

  return task;
}

export async function updateTask(input: {
  id: string;
  title?: string;
  description?: string;
  columnId?: string;
  assigneeId?: string;
  publishAt?: string | null;
  publishTelegram?: boolean;
  publishVkOk?: boolean;
  publishWebsite?: boolean;
  priority?: string;
}) {
  await createUserIfNotExists();

  const data: any = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.columnId !== undefined) data.columnId = input.columnId;
  if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;
  if (input.publishAt !== undefined) {
    data.publishAt = input.publishAt ? new Date(input.publishAt) : null;
  }
  if (input.publishTelegram !== undefined)
    data.publishTelegram = input.publishTelegram;
  if (input.publishVkOk !== undefined) data.publishVkOk = input.publishVkOk;
  if (input.publishWebsite !== undefined)
    data.publishWebsite = input.publishWebsite;
  if (input.priority !== undefined) data.priority = input.priority;

  const task = await db.task.update({
    where: { id: input.id },
    data,
    include: {
      assignee: true,
    },
  });

  return task;
}

export async function deleteTask(input: { id: string }) {
  await createUserIfNotExists();

  // First check if task exists and get its details
  const task = await db.task.findUnique({
    where: { id: input.id },
  });

  if (!task) {
    throw new Error("Задача не найдена");
  }

  // Delete the task (cascade deletion will handle attachments and publications)
  const deletedTask = await db.task.delete({
    where: { id: input.id },
  });

  return deletedTask;
}

// Attachment Management
export async function uploadAttachment(input: {
  taskId: string;
  filename: string;
  base64: string;
  fileType: string;
  fileSize: number;
}) {
  const auth = await getAuth({ required: true });

  // Upload file to storage
  const fileUrl = await upload({
    bufferOrBase64: input.base64,
    fileName: input.filename,
  });

  // Create attachment record
  const attachment = await db.attachment.create({
    data: {
      filename: input.filename,
      fileUrl,
      fileType: input.fileType,
      fileSize: input.fileSize,
      taskId: input.taskId,
      uploaderId: auth.userId,
    },
    include: {
      uploader: true,
    },
  });

  return attachment;
}

export async function getTaskAttachments(input: { taskId: string }) {
  await createUserIfNotExists();

  // Validate input parameters with detailed logging
  if (!input) {
    console.error("getTaskAttachments called without input parameter");
    throw new Error("Параметр input обязателен для получения вложений задачи");
  }

  if (!input.taskId) {
    console.error("getTaskAttachments called with missing taskId:", { input });
    throw new Error("Параметр taskId обязателен для получения вложений задачи");
  }

  if (typeof input.taskId !== "string" || input.taskId.trim() === "") {
    console.error("getTaskAttachments called with invalid taskId:", {
      taskId: input.taskId,
      type: typeof input.taskId,
    });
    throw new Error("Параметр taskId должен быть непустой строкой");
  }

  try {
    const attachments = await db.attachment.findMany({
      where: { taskId: input.taskId },
      include: {
        uploader: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return attachments;
  } catch (error) {
    console.error(
      "Error fetching task attachments for taskId:",
      input.taskId,
      error,
    );
    throw new Error(
      `Не удалось получить вложения для задачи ${input.taskId}: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`,
    );
  }
}

export async function deleteAttachment(input: { id: string }) {
  const auth = await getAuth({ required: true });

  // Check if user is the uploader or a manager
  const attachment = await db.attachment.findUnique({
    where: { id: input.id },
    include: { uploader: true },
  });

  if (!attachment) {
    throw new Error("Вложение не найдено");
  }

  const currentUser = await db.user.findUnique({
    where: { id: auth.userId },
  });

  if (
    attachment.uploaderId !== auth.userId &&
    currentUser?.role !== "MANAGER"
  ) {
    throw new Error("У вас нет прав на удаление этого вложения");
  }

  await db.attachment.delete({
    where: { id: input.id },
  });

  return { success: true };
}

// Telegram Bot Integration
// Модель данных для Telegram webhook
const TelegramUpdateSchema = z.object({
  message: z.object({
    message_id: z.number(),
    from: z.object({
      id: z.number(),
      is_bot: z.boolean(),
      first_name: z.string(),
      username: z.string().optional(),
    }),
    chat: z.object({
      id: z.number(),
      type: z.string(),
    }),
    date: z.number(),
    text: z.string().optional(),
    photo: z
      .array(
        z.object({
          file_id: z.string(),
          file_unique_id: z.string(),
          file_size: z.number(),
          width: z.number(),
          height: z.number(),
        }),
      )
      .optional(),
    document: z
      .object({
        file_id: z.string(),
        file_name: z.string().optional(),
        mime_type: z.string().optional(),
        file_size: z.number().optional(),
      })
      .optional(),
  }),
});

// Функция для получения настроек Telegram-бота
export async function getTelegramSettings() {
  const auth = await getAuth({ required: true });

  // Проверка роли пользователя
  const currentUser = await db.user.findUnique({
    where: { id: auth.userId },
  });

  if (currentUser?.role !== "MANAGER") {
    throw new Error(
      "Только руководители могут просматривать настройки Telegram-бота",
    );
  }

  const settings = await db.telegramSettings.findFirst({
    orderBy: { createdAt: "desc" },
  });

  // Если настройки не найдены, вернуть пустые значения
  if (!settings) {
    return {
      botToken: "",
      defaultColumnId: "",
      isActive: false,
    };
  }

  return settings;
}

// Функция для сохранения настроек Telegram-бота
export async function saveTelegramSettings(input: {
  botToken: string;
  defaultColumnId: string;
  isActive: boolean;
}) {
  const auth = await getAuth({ required: true });

  // Проверка роли пользователя
  const currentUser = await db.user.findUnique({
    where: { id: auth.userId },
  });

  if (currentUser?.role !== "MANAGER") {
    throw new Error(
      "Только руководители могут изменять настройки Telegram-бота",
    );
  }

  const existingSettings = await db.telegramSettings.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (existingSettings) {
    // Обновить существующие настройки
    const settings = await db.telegramSettings.update({
      where: { id: existingSettings.id },
      data: input,
    });

    // Установить webhook
    if (input.isActive && input.botToken) {
      try {
        await setupTelegramWebhook(input.botToken);
      } catch (error) {
        console.error("Error setting up webhook:", error);
        throw new Error("Не удалось настроить webhook для Telegram-бота");
      }
    }

    return settings;
  } else {
    // Создать новые настройки
    const settings = await db.telegramSettings.create({
      data: input,
    });

    // Установить webhook
    if (input.isActive && input.botToken) {
      try {
        await setupTelegramWebhook(input.botToken);
      } catch (error) {
        console.error("Error setting up webhook:", error);
        throw new Error("Не удалось настроить webhook для Telegram-бота");
      }
    }

    return settings;
  }
}

// Функция для настройки Telegram webhook
async function setupTelegramWebhook(botToken: string) {
  const baseUrl = await getBaseUrl();
  const webhookUrl = `${baseUrl}/webhook/telegram`;

  const telegramApiUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;

  try {
    const response = await axios.post(telegramApiUrl, {
      url: webhookUrl,
    });

    if (!response.data.ok) {
      throw new Error(`Telegram API error: ${response.data.description}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Error setting up Telegram webhook:", error);
    throw error;
  }
}

// Функция для отправки сообщения через Telegram Bot API
async function sendTelegramMessage(
  chatId: number,
  text: string,
  botToken: string,
) {
  const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await axios.post(telegramApiUrl, {
      chat_id: chatId,
      text: text,
    });

    return response.data;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    throw error;
  }
}

// Функция для получения файла из Telegram
async function getTelegramFile(fileId: string, botToken: string) {
  // Сначала получаем информацию о файле
  const fileInfoUrl = `https://api.telegram.org/bot${botToken}/getFile`;

  try {
    const fileInfoResponse = await axios.post(fileInfoUrl, {
      file_id: fileId,
    });

    if (!fileInfoResponse.data.ok) {
      throw new Error(
        `Telegram API error: ${fileInfoResponse.data.description}`,
      );
    }

    const filePath = fileInfoResponse.data.result.file_path;

    // Теперь получаем сам файл
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const fileResponse = await axios.get(fileUrl, {
      responseType: "arraybuffer",
    });

    // Преобразуем в base64
    const base64 = Buffer.from(fileResponse.data).toString("base64");
    const mimeType =
      fileResponse.headers["content-type"] || "application/octet-stream";

    return {
      base64: `data:${mimeType};base64,${base64}`,
      mimeType,
      size: fileResponse.data.length,
    };
  } catch (error) {
    console.error("Error getting Telegram file:", error);
    throw error;
  }
}

// Webhook для приема сообщений от Telegram
export async function _webhookTelegram(body: unknown) {
  try {
    // Валидация входящих данных
    const parsedBody = TelegramUpdateSchema.parse(body);

    // Получение настроек бота
    const settings = await db.telegramSettings.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!settings || !settings.isActive) {
      console.error("Telegram bot is not configured or inactive");
      return { success: false, error: "Bot not configured" };
    }

    // Получение колонки по умолчанию
    const defaultColumn = await db.column.findFirst({
      where: { id: settings.defaultColumnId },
    });

    if (!defaultColumn) {
      console.error("Default column not found");
      return { success: false, error: "Default column not found" };
    }

    // Получение информации о сообщении
    const { message } = parsedBody;
    const messageText = message.text || "Новая задача";
    const username = message.from.username || message.from.first_name;
    const messageDate = new Date(message.date * 1000);

    // Проверяем, есть ли сообщения от того же пользователя за последнюю минуту
    const oneMinuteAgo = new Date(messageDate.getTime() - 60000); // 1 минута назад

    const recentTask = await db.task.findFirst({
      where: {
        source: "telegram",
        sourceUser: username,
        createdAt: {
          gte: oneMinuteAgo,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Определение языка сообщения (примитивная проверка)
    const isEnglish =
      /^[a-zA-Z0-9\s.,!?:;"'()\[\]{}\-_+=*&^%$#@~`|\\/<>]*$/.test(messageText);

    // Создание заголовка из первых слов сообщения
    let title = messageText;
    if (messageText.length > 50) {
      const words = messageText.split(" ");
      title = words.slice(0, 5).join(" ");
      if (title.length < 10 && words.length > 5) {
        title = words.slice(0, 10).join(" ");
      }
      if (title.length > 50) {
        title = title.substring(0, 47) + "...";
      }
    }

    // Поиск пользователя-администратора для загрузки файлов
    const adminUser = await db.user.findFirst({
      where: { role: "MANAGER" },
    });

    if (!adminUser) {
      console.error("No admin user found for file uploads");
      return { success: false, error: "No admin user found" };
    }

    let task;

    if (recentTask) {
      // Если есть недавняя задача от того же пользователя, добавляем сообщение к ней
      const updatedDescription = `${recentTask.description}\n\n--- Новое сообщение ---\n${messageText}\nВремя: ${messageDate.toLocaleString()}`;

      task = await db.task.update({
        where: { id: recentTask.id },
        data: {
          description: updatedDescription,
          updatedAt: new Date(),
        },
      });

      console.log(
        `Обновлена существующая задача ${task.id} для пользователя ${username}`,
      );
    } else {
      // Иначе создаем новую задачу
      // Формирование описания с информацией об отправителе
      const description = `${messageText}\n\nОтправитель: @${username}\nВремя: ${messageDate.toLocaleString()}`;

      task = await db.task.create({
        data: {
          title,
          description,
          columnId: defaultColumn.id,
          source: "telegram",
          sourceUser: username,
        },
      });

      console.log(
        `Создана новая задача ${task.id} для пользователя ${username}`,
      );

      // If task has a future date in description, try to schedule it automatically
      const dateRegex = /(\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4})/;
      const timeRegex = /(\d{1,2}:\d{2})/;
      const dateMatch = messageText.match(dateRegex);
      const timeMatch = messageText.match(timeRegex);

      if (dateMatch && typeof dateMatch[1] === "string") {
        try {
          // Parse the date
          const dateParts = dateMatch[1].split(/[.\/\-]/);
          let day, month, year;

          if (
            dateParts.length === 3 &&
            typeof dateParts[0] === "string" &&
            typeof dateParts[1] === "string" &&
            typeof dateParts[2] === "string"
          ) {
            day = parseInt(dateParts[0]);
            month = parseInt(dateParts[1]) - 1; // JS months are 0-indexed
            year = parseInt(dateParts[2]);

            // Handle 2-digit years
            if (year < 100) {
              year += year < 50 ? 2000 : 1900;
            }

            const scheduledDate = new Date(year, month, day);

            // Set time if found, otherwise default to 9:00
            if (timeMatch && typeof timeMatch[1] === "string") {
              const timeParts = timeMatch[1].split(":");
              if (
                Array.isArray(timeParts) &&
                typeof timeParts[0] === "string" &&
                typeof timeParts[1] === "string"
              ) {
                scheduledDate.setHours(
                  parseInt(timeParts[0]),
                  parseInt(timeParts[1]),
                );
              } else {
                scheduledDate.setHours(9, 0);
              }
            } else {
              scheduledDate.setHours(9, 0);
            }

            // Only schedule if date is in the future
            if (scheduledDate > new Date()) {
              await db.task.update({
                where: { id: task.id },
                data: { publishAt: scheduledDate },
              });

              // Try to schedule publication
              try {
                await schedulePublication({
                  taskId: task.id,
                  removeFromKanban: true,
                });

                // Send confirmation with scheduled date
                const confirmationText = isEnglish
                  ? `Task scheduled for publication on ${scheduledDate.toLocaleDateString()}`
                  : `Задача запланирована к публикации на ${scheduledDate.toLocaleDateString("ru-RU")}`;

                await sendTelegramMessage(
                  message.chat.id,
                  confirmationText,
                  settings.botToken,
                );
                return { success: true, taskId: task.id, scheduled: true };
              } catch (scheduleError) {
                console.error("Error scheduling publication:", scheduleError);
              }
            }
          }
        } catch (dateError) {
          console.error("Error parsing date from message:", dateError);
        }
      }
    }

    // Обработка вложений
    if (message.photo && message.photo.length > 0) {
      // Берем фото с наилучшим качеством (последнее в массиве)
      try {
        const bestPhoto = message.photo[message.photo.length - 1];
        if (bestPhoto && bestPhoto.file_id) {
          const fileData = await getTelegramFile(
            bestPhoto.file_id,
            settings.botToken,
          );

          await db.attachment.create({
            data: {
              filename: `photo_${message.date}.jpg`,
              fileUrl: await upload({
                bufferOrBase64: fileData.base64,
                fileName: `telegram_photo_${message.date}.jpg`,
              }),
              fileType: "image/jpeg",
              fileSize: fileData.size,
              taskId: task.id,
              uploaderId: adminUser.id,
            },
          });
        }
      } catch (error) {
        console.error("Error processing photo attachment:", error);
      }
    }

    if (message.document) {
      try {
        const fileData = await getTelegramFile(
          message.document.file_id,
          settings.botToken,
        );

        await db.attachment.create({
          data: {
            filename: message.document.file_name || `document_${message.date}`,
            fileUrl: await upload({
              bufferOrBase64: fileData.base64,
              fileName:
                message.document.file_name ||
                `telegram_document_${message.date}`,
            }),
            fileType: message.document.mime_type || "application/octet-stream",
            fileSize: fileData.size,
            taskId: task.id,
            uploaderId: adminUser.id,
          },
        });
      } catch (error) {
        console.error("Error processing document attachment:", error);
      }
    }

    // Отправка ответа пользователю
    const responseText = isEnglish
      ? recentTask
        ? "Message added to existing card!"
        : "Card successfully added to the board!"
      : recentTask
        ? "Сообщение добавлено к существующей карточке!"
        : "Карточка успешно добавлена на доску!";

    await sendTelegramMessage(message.chat.id, responseText, settings.botToken);

    return { success: true, taskId: task.id, scheduled: false };
  } catch (error) {
    console.error("Error processing Telegram webhook:", error);
    return { success: false, error: String(error) };
  }
}

// Export functionality
export async function exportPublications(input: {
  startDate: string;
  endDate: string;
  format: "pdf" | "excel";
}) {
  await createUserIfNotExists();

  // TODO: Adapt export logic for unified tasks model
  return {
    data: [],
    format: input.format,
    filename: `content-plan-${input.startDate}-${input.endDate}.${input.format === "pdf" ? "pdf" : "xlsx"}`,
  };
}

// Content Plan Management - using tasks directly
export async function listContentPlanTasks() {
  try {
    await createUserIfNotExists();

    return await safeDatabaseOperation(
      () =>
        db.task.findMany({
          where: {
            publishAt: { not: null },
            columnId: null,
          },
          include: {
            assignee: true,
          },
          orderBy: { publishAt: "asc" },
        }),
      // Enhanced fallback with sample content plan tasks
      [
        {
          id: "sample-content-1",
          title: "Пример публикации",
          description:
            "Это пример задачи в контент-плане. База данных недоступна.",
          assigneeId: null,
          assignee: null,
          columnId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          publishAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
          publishTelegram: true,
          publishVkOk: false,
          publishWebsite: true,
          priority: "green",

          source: null,
          sourceUser: null,
        },
      ],
      "listContentPlanTasks",
    );
  } catch (error: any) {
    console.error("[listContentPlanTasks] Critical Error:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      dbStatus: dbHealthStatus,
    });
    return [];
  }
}

// Function to move a task from Content Plan back to Kanban
export async function returnTaskToKanban(input: { taskId: string }) {
  const auth = await getAuth({ required: true });

  // Check if current user is a manager for this operation
  const currentUser = await db.user.findUnique({
    where: { id: auth.userId },
  });

  if (currentUser?.role !== "MANAGER") {
    throw new Error("Только руководители могут возвращать задачи в канбан");
  }

  // Find the task
  const task = await db.task.findUnique({
    where: { id: input.taskId },
  });

  if (!task) {
    throw new Error("Задача не найдена");
  }

  // Find the "Ready for publication" column
  const readyForPublicationColumn = await db.column.findFirst({
    where: { name: "Готово к публикации" },
  });

  if (!readyForPublicationColumn) {
    throw new Error("Колонка 'Готово к публикации' не найдена");
  }

  // Update the task to put it back in the kanban board
  const updatedTask = await db.task.update({
    where: { id: input.taskId },
    data: { columnId: readyForPublicationColumn.id },
    include: { column: true },
  });

  return updatedTask;
}

export async function updateContentPlanTask(input: {
  id: string;
  publishAt?: string;
  publishTelegram?: boolean;
  publishVkOk?: boolean;
  publishWebsite?: boolean;
}) {
  await createUserIfNotExists();

  const data: any = {};
  if (input.publishAt !== undefined) {
    data.publishAt = input.publishAt ? new Date(input.publishAt) : null;
  }
  if (input.publishTelegram !== undefined)
    data.publishTelegram = input.publishTelegram;
  if (input.publishVkOk !== undefined) data.publishVkOk = input.publishVkOk;
  if (input.publishWebsite !== undefined)
    data.publishWebsite = input.publishWebsite;

  const task = await db.task.update({
    where: { id: input.id },
    data,
    include: {
      assignee: true,
    },
  });

  return task;
}

export async function deleteContentPlanTask(input: { id: string }) {
  const auth = await getAuth({ required: true });

  // Check if current user is a manager for deletion rights
  const currentUser = await db.user.findUnique({
    where: { id: auth.userId },
  });

  if (currentUser?.role !== "MANAGER") {
    throw new Error(
      "Только руководители могут удалять задачи из контент-плана",
    );
  }

  const task = await db.task.delete({
    where: { id: input.id },
  });

  return task;
}

export async function schedulePublication(input: {
  taskId: string;
  removeFromKanban?: boolean;
}) {
  await createUserIfNotExists();

  // Get task details
  const task = await db.task.findUnique({
    where: { id: input.taskId },
    include: { column: true },
  });

  if (!task) {
    throw new Error("Задача не найдена");
  }

  // If task has a publish date and time, use it exactly as specified
  if (task.publishAt) {
    // If we need to remove from Kanban, disconnect the task from its column
    if (input.removeFromKanban) {
      await db.task.update({
        where: { id: task.id },
        data: { columnId: null },
      });
    }

    return task;
  }

  // If no publish date is set, find the next available time slot starting from today
  const today = new Date();
  today.setHours(9, 0, 0, 0); // Start from 9:00 AM

  // Define time slots for automatic distribution: 9:00, 13:00, 15:00, 17:00
  const timeSlots = [9, 13, 15, 17];

  // Check up to 30 days ahead starting from today
  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);

    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    // Try each time slot for this day
    for (const hour of timeSlots) {
      const scheduleDate = new Date(date);
      scheduleDate.setHours(hour, 0, 0, 0);

      // Check if this specific time slot is available
      const existingTask = await db.task.findFirst({
        where: {
          publishAt: scheduleDate,
          columnId: null, // Only check tasks in content plan
        },
      });

      if (!existingTask) {
        // Slot is available, update task with this time
        const updatedTask = await db.task.update({
          where: { id: task.id },
          data: {
            publishAt: scheduleDate,
            columnId: input.removeFromKanban ? null : task.columnId,
          },
          include: {
            assignee: true,
          },
        });

        return updatedTask;
      }
    }
  }

  throw new Error("Не удалось найти свободный слот для публикации");
}

// Seed initial data
export async function _seedInitialData() {
  // Check if we already have columns
  const columnsCount = await db.column.count();
  if (columnsCount > 0) return;

  // Create default columns
  const columns = await Promise.all([
    db.column.create({ data: { name: "Задачи", order: 1 } }),
    db.column.create({ data: { name: "В работе", order: 2 } }),
    db.column.create({ data: { name: "Готово для проверки", order: 3 } }),
    db.column.create({ data: { name: "Готово к публикации", order: 4 } }),
  ]);

  return { success: true, columns };
}
