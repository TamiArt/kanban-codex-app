// Defensive patch for Node.contains error (TypeError: parameter 1 is not of type 'Node')
if (
  typeof window !== "undefined" &&
  window.Node &&
  window.Node.prototype.contains
) {
  const originalContains = window.Node.prototype.contains;
  window.Node.prototype.contains = function (target) {
    if (!(target instanceof Node)) return false;
    return originalContains.call(this, target);
  };
}

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
} from "react-router-dom";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "~/client/api";
import { useAuth, useToast, encodeFileAsBase64DataURL } from "~/client/utils";

import {
  Layout,
  Menu,
  Plus,
  Settings,
  User,
  Trash2,
  Edit,
  Save,
  X,
  ChevronRight,
  Calendar,
  Users,
  Paperclip,
  File,
  Download,
  FileText,
  Image,
  FileArchive,
  AlertCircle,
  MessageSquare,
  Bot,
  ToggleLeft,
  ToggleRight,
  Eye,
  EyeOff,
  Key,
  Clock,
  ArrowLeft,
  ArrowRight,
  CalendarIcon,
  CheckSquare,
  Square,
  Globe,
  Share2,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Badge,
} from "~/components/ui";

// Types
// This is the response we get from the API

// This is the type we use in our components
type Column = {
  id: string;
  name: string;
  order: number;
  tasks: Task[];
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  assignee: User | null;
  columnId: string | null;
  createdAt: string;
  updatedAt: string;
  publishAt: string | null;
  publishTelegram: boolean;
  publishVkOk: boolean;
  publishWebsite: boolean;
  priority: string;
};

type Attachment = {
  id: string;
  filename: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  taskId: string;
  uploaderId: string;
  uploader: User;
  createdAt: string;
};

type User = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
};

// Database health hook
function useDatabaseHealth() {
  return useQuery(["databaseHealth"], apiClient.getDatabaseHealth, {
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Check every 30 seconds
    retry: false, // Don't retry health checks
  });
}

// Custom hooks for API calls

function useTaskAttachments(taskId: string, enabled = true) {
  return useQuery(
    ["attachments", taskId],
    () => apiClient.getTaskAttachments({ taskId }),
    {
      enabled: enabled && !!taskId && taskId.trim() !== "", // Only run if explicitly enabled and taskId is valid
      select: (data) =>
        data.map((attachment) => ({
          ...attachment,
          createdAt: attachment.createdAt.toString(),
        })),
      staleTime: 5 * 60 * 1000, // 5 minutes - attachments don't change frequently
      cacheTime: 10 * 60 * 1000, // 10 minutes cache
      refetchOnWindowFocus: false, // Prevent unnecessary refetches
      refetchOnMount: false, // Prevent refetch on component mount if data exists
      retry: 2, // Limit retries to prevent rate limiting
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    },
  );
}

// Login Page Component
function LoginPage() {
  const auth = useAuth();
  const [role, setRole] = useState<"EMPLOYEE" | "MANAGER">("EMPLOYEE");
  const [authMethod, setAuthMethod] = useState<"email" | "phone" | "telegram">(
    "email",
  );
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const { toast } = useToast();

  // Store selected role in localStorage to use it when creating user
  useEffect(() => {
    localStorage.setItem("selectedRole", role);
  }, [role]);

  const handleLogin = () => {
    if (authMethod === "email" && !email) {
      toast({
        title: "Ошибка",
        description: "Введите email для авторизации",
        variant: "destructive",
      });
      return;
    }

    if (authMethod === "phone" && !phone) {
      toast({
        title: "Ошибка",
        description: "Введите номер телефона для авторизации",
        variant: "destructive",
      });
      return;
    }

    if (authMethod === "email") {
      auth.signIn({ provider: "AC1", email });
    } else if (authMethod === "phone") {
      // Phone must be in E.164 format (e.g., +79123456789)
      const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;
      auth.signIn({ provider: "AC1", phoneNumber: formattedPhone });
    } else if (authMethod === "telegram") {
      // For Telegram, we use the default AC1 authentication drawer
      auth.signIn({ provider: "AC1" });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            КанбанПро
          </CardTitle>
          <p className="text-center text-muted-foreground">
            Войдите в систему для доступа к канбан-доске
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Выберите способ авторизации
            </label>
            <Tabs
              defaultValue="email"
              onValueChange={(v) => setAuthMethod(v as any)}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="phone">Телефон</TabsTrigger>
                <TabsTrigger value="telegram">Telegram</TabsTrigger>
              </TabsList>
              <TabsContent value="email" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </TabsContent>
              <TabsContent value="phone" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm font-medium">
                    Телефон
                  </label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+79123456789"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </TabsContent>
              <TabsContent value="telegram" className="space-y-4 mt-4">
                <div className="text-center p-4 bg-muted rounded-md">
                  <p>
                    Вы будете перенаправлены на страницу авторизации Adaptive.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Выберите роль</label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as "EMPLOYEE" | "MANAGER")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите роль" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EMPLOYEE">Сотрудник</SelectItem>
                <SelectItem value="MANAGER">Руководитель</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Руководители могут управлять пользователями и настройками системы
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full" onClick={handleLogin}>
            {auth.status === "loading" ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                Загрузка...
              </span>
            ) : (
              "Войти"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// Protected Route Component
function ProtectedRoute({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: string;
}) {
  const auth = useAuth({ required: true });
  const { data: currentUser } = useQuery(
    ["currentUser"],
    apiClient.getCurrentUser,
  );

  if (auth.status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="flex items-center gap-2">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
          Загрузка...
        </span>
      </div>
    );
  }

  // "unauthenticated" case is handled by AuthWrapper, so we don't check it here

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="flex items-center gap-2">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
          Загрузка профиля...
        </span>
      </div>
    );
  }

  if (requiredRole && currentUser.role !== requiredRole) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}

// Attachment Component
function AttachmentItem({ attachment }: { attachment: Attachment }) {
  const getFileIcon = () => {
    const type = attachment.fileType.toLowerCase();
    if (type.includes("image")) return <Image className="h-4 w-4" />;
    if (type.includes("pdf")) return <FileText className="h-4 w-4" />;
    if (type.includes("zip") || type.includes("rar"))
      return <FileArchive className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <a
      href={attachment.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 p-2 rounded-md hover:bg-accent text-sm"
    >
      {getFileIcon()}
      <div className="flex-1 truncate">{attachment.filename}</div>
      <div className="text-xs text-muted-foreground">
        {formatFileSize(attachment.fileSize)}
      </div>
      <Download className="h-4 w-4 opacity-50" />
    </a>
  );
}

// Task Card Component
function TaskCard({ task, column }: { task: Task; column: Column }) {
  const queryClient = useQueryClient();
  const { data: columns = [] } = useQuery(["columns"], apiClient.listColumns);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [publishTime, setPublishTime] = useState(
    task.publishAt
      ? new Date(task.publishAt).toTimeString().substring(0, 5)
      : "",
  );
  const [publishDate, setPublishDate] = useState(
    task.publishAt ? new Date(task.publishAt).toISOString().split("T")[0] : "",
  );

  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Only load attachments when dialog is open (lazy loading)
  const { data: attachments = [], isLoading: attachmentsLoading } =
    useTaskAttachments(
      task.id,
      isDialogOpen, // Only fetch when dialog is actually open
    );

  const updateTaskMutation = useMutation(apiClient.updateTask, {
    onSuccess: () => {
      queryClient.invalidateQueries(["columns"]);
      toast({
        title: "Задача обновлена",
        description: "Изменения сохранены успешно",
      });
      if (!isDialogOpen) {
        setIsEditing(false);
      }
    },
    onError: (error) => {
      console.error("[TaskCard updateTask] RPC Error Details:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        endpoint: "updateTask",
        context: `Updating task ${task.id}`,
        taskData: { id: task.id, title: task.title },
      });
      toast({
        title: "Ошибка обновления",
        description:
          error instanceof Error ? error.message : "Не удалось обновить задачу",
        variant: "destructive",
      });
    },
  });

  const scheduleMutation = useMutation(
    (params: { taskId: string; removeFromKanban?: boolean }) =>
      apiClient.schedulePublication(params),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(["contentPlanTasks"]);
        queryClient.invalidateQueries(["columns"]);
        toast({
          title: "Публикация запланирована",
          description: "Задача добавлена в контент-план",
        });
      },
      onError: (error) => {
        console.error("TaskCard schedulePublication error:", error);
        toast({
          title: "Ошибка планирования",
          description:
            error instanceof Error
              ? error.message
              : "Не удалось запланировать публикацию",
          variant: "destructive",
        });
      },
    },
  );

  const deleteTaskMutation = useMutation(apiClient.deleteTask, {
    onSuccess: () => {
      queryClient.invalidateQueries(["columns"]);
      toast({
        title: "Задача удалена",
        description: "Задача была успешно удалена",
      });
      setIsDialogOpen(false);
    },
    onError: (error) => {
      console.error("[TaskCard deleteTask] RPC Error Details:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        endpoint: "deleteTask",
        context: `Deleting task ${task.id}`,
        taskData: { id: task.id, title: task.title },
      });
      toast({
        title: "Ошибка удаления",
        description:
          error instanceof Error ? error.message : "Не удалось удалить задачу",
        variant: "destructive",
      });
    },
  });

  const moveToPublishReadyMutation = useMutation(
    () => {
      // Find the "Готово к публикации" column
      const publishReadyColumn = columns.find(
        (col) => col.name === "Готово к публикации",
      );

      if (!publishReadyColumn) {
        toast({
          title: "Ошибка",
          description: "Не удалось найти колонку 'Готово к публикации'",
          variant: "destructive",
        });
        return Promise.reject("Column not found");
      }

      return apiClient.updateTask({
        id: task.id,
        columnId: publishReadyColumn.id,
      });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(["columns"]);
        toast({
          title: "Задача перемещена",
          description: "Задача перемещена в 'Готово к публикации'",
        });
        setIsDialogOpen(false);
      },
      onError: (error) => {
        console.error("TaskCard moveToPublishReady error:", error);
        toast({
          title: "Ошибка перемещения",
          description:
            error instanceof Error
              ? error.message
              : "Не удалось переместить задачу",
          variant: "destructive",
        });
      },
    },
  );

  const uploadAttachmentMutation = useMutation(apiClient.uploadAttachment, {
    onSuccess: () => {
      queryClient.invalidateQueries(["attachments", task.id]);
      toast({
        title: "Файл прикреплен",
        description: "Файл успешно прикреплен к задаче",
      });
      setIsUploading(false);
    },
    onError: (error) => {
      console.error("Error uploading file:", error);
      toast({
        title: "Ошибка загрузки",
        description: "Не удалось загрузить файл",
        variant: "destructive",
      });
      setIsUploading(false);
    },
  });

  const handleSave = () => {
    const publishDateTime =
      publishDate && publishTime
        ? new Date(`${publishDate}T${publishTime}:00`)
        : null;

    updateTaskMutation.mutate({
      id: task.id,
      title,
      description,
      publishAt: publishDateTime ? publishDateTime.toISOString() : null,
    });
  };

  const handleDelete = () => {
    if (window.confirm("Вы уверены, что хотите удалить эту задачу?")) {
      deleteTaskMutation.mutate({ id: task.id });
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const base64 = await encodeFileAsBase64DataURL(file);

      uploadAttachmentMutation.mutate({
        taskId: task.id,
        filename: file.name,
        base64,
        fileType: file.type,
        fileSize: file.size,
      });
    } catch (error) {
      console.error("Error processing file:", error);
      toast({
        title: "Ошибка обработки файла",
        description: "Не удалось обработать файл для загрузки",
        variant: "destructive",
      });
      setIsUploading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // Получение первых 10 слов из описания для отображения как заголовок
  const autoTitle = useMemo(() => {
    if (!task.description) return task.title;
    const words = task.description.trim().split(/\s+/);
    if (words.length <= 10) return task.description;
    return words.slice(0, 10).join(" ") + "...";
  }, [task.description, task.title]);

  // Обработчик клика по карточке для открытия диалога
  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDialogOpen(true);
  };

  // Priority flag colors
  const priorityColors = {
    red: "bg-red-500",
    yellow: "bg-yellow-500",
    green: "bg-green-500",
  };

  // Обычная карточка
  return (
    <>
      <Card
        className="mb-4 shadow-sm cursor-pointer hover:bg-accent/10 transition-colors relative"
        onClick={handleCardClick}
      >
        <div
          className={`absolute h-full w-1.5 left-0 top-0 ${priorityColors[task.priority as keyof typeof priorityColors] || "bg-green-500"}`}
          aria-label={`Приоритет: ${task.priority}`}
        />
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{autoTitle}</CardTitle>
        </CardHeader>
        <CardContent className="pb-2">
          <div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {task.description && task.description.split(".").length > 0
                ? task.description.split(".")[0]?.trim() +
                  (task.description.split(".").length > 1 ? "..." : "")
                : task.description}
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {task.publishTelegram && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Share2 className="h-3 w-3" />
                  <span>Telegram</span>
                </Badge>
              )}
              {task.publishVkOk && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Share2 className="h-3 w-3" />
                  <span>ВК/ОК</span>
                </Badge>
              )}
              {task.publishWebsite && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  <span>Сайт</span>
                </Badge>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
            <div>
              Исполнитель:{" "}
              {task.assignee?.name || task.assignee?.email || "Не назначен"}
            </div>
            {/* Show attachment count only if we have data or are loading */}
            {(attachments.length > 0 || attachmentsLoading) && (
              <div>
                Вложений: {attachmentsLoading ? "..." : attachments.length}
              </div>
            )}
            {task.publishAt && (
              <div>Публикация: {formatDate(task.publishAt)}</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Диалог для обычной карточки */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          className="mx-2 sm:mx-auto sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
          aria-describedby="task-dialog-description-full"
        >
          <DialogHeader>
            <DialogTitle>
              {isEditing ? (
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="font-bold text-lg"
                />
              ) : (
                task.title
              )}
            </DialogTitle>
          </DialogHeader>
          <div id="task-dialog-description-full" className="sr-only">
            Диалог просмотра и редактирования полной информации о задаче включая
            описание, платформы публикации и вложения
          </div>

          <div className="space-y-4">
            {/* Описание задачи */}
            <div>
              <h3 className="text-sm font-medium mb-2">Описание</h3>
              <p className="text-sm whitespace-pre-wrap">{task.description}</p>
            </div>

            {/* Платформы публикации */}
            <div>
              <h3 className="text-sm font-medium mb-2">Платформы публикации</h3>
              <div className="flex flex-wrap gap-2">
                {task.publishTelegram && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Share2 className="h-3 w-3" />
                    <span>Telegram</span>
                  </Badge>
                )}
                {task.publishVkOk && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Share2 className="h-3 w-3" />
                    <span>ВК/ОК</span>
                  </Badge>
                )}
                {task.publishWebsite && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    <span>Сайт</span>
                  </Badge>
                )}
              </div>
            </div>

            {/* Дата публикации */}
            {task.publishAt && (
              <div>
                <h3 className="text-sm font-medium mb-2">Дата публикации</h3>
                <p className="text-sm">{formatDate(task.publishAt)}</p>
              </div>
            )}

            {/* Вложения */}
            <div>
              <h3 className="text-sm font-medium mb-2">Вложения</h3>
              {attachmentsLoading ? (
                <div className="text-sm text-muted-foreground">
                  Загрузка вложений...
                </div>
              ) : attachments.length > 0 ? (
                <div className="border rounded-md divide-y">
                  {attachments.map((attachment) => (
                    <AttachmentItem
                      key={attachment.id}
                      attachment={attachment}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Нет вложений
                </div>
              )}
            </div>

            {/* Информация о задаче */}
            <div className="text-xs text-muted-foreground">
              <div>
                Исполнитель:{" "}
                {task.assignee?.name || task.assignee?.email || "Не назначен"}
              </div>
              <div>Создано: {formatDate(task.createdAt)}</div>
              <div>Последнее обновление: {formatDate(task.updatedAt)}</div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsEditing(true);
                  setIsDialogOpen(false);
                }}
              >
                <Edit className="h-4 w-4 mr-1" /> Редактировать
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <Paperclip className="h-4 w-4 mr-1" />
                {isUploading ? "Загрузка..." : "Прикрепить"}
              </Button>
              {column.name === "Готово для проверки" && (
                <Button
                  size="sm"
                  onClick={() => moveToPublishReadyMutation.mutate()}
                >
                  <ChevronRight className="h-4 w-4 mr-1" /> В публикацию
                </Button>
              )}
              {column.name === "Готово к публикации" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    scheduleMutation.mutate({
                      taskId: task.id,
                      removeFromKanban: true,
                    });
                  }}
                >
                  <Calendar className="h-4 w-4 mr-1" /> В Контент-план
                </Button>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </DialogFooter>

          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// Drag and Drop types
interface DragItem {
  type: string;
  id: string;
  columnId: string;
}

// Column Component
function ColumnComponent({
  column,
  onAddTask,
}: {
  column: Column;
  onAddTask: (columnId: string) => void;
}) {
  const [{ isOver }, drop] = useDrop({
    accept: "task",
    drop: (item: DragItem) => {
      if (item.columnId !== column.id) {
        // Move task to this column
        updateTaskMutation.mutate({
          id: item.id,
          columnId: column.id,
        });
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  const queryClient = useQueryClient();

  const updateTaskMutation = useMutation(apiClient.updateTask, {
    onSuccess: () => {
      queryClient.invalidateQueries(["columns"]);
    },
    onError: (error) => {
      console.error("[ColumnComponent updateTask] RPC Error Details:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        endpoint: "updateTask",
        context: `Drag and drop task to column ${column.id}`,
        columnData: { id: column.id, name: column.name },
      });
    },
  });

  return (
    <div
      ref={drop}
      className={`flex flex-col bg-muted rounded-lg p-2 md:p-4 transition-colors ${
        isOver ? "bg-primary/10 border-2 border-primary border-dashed" : ""
      } w-[80vw] flex-shrink-0 sm:w-[280px] md:w-[250px]`}
    >
      <div className="flex justify-between items-center mb-3 md:mb-4">
        <h3 className="font-medium text-sm md:text-base truncate mr-2">
          {column.name}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAddTask(column.id)}
          className="flex-shrink-0 h-8 w-8 p-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[calc(100vh-160px)] md:max-h-[calc(100vh-180px)]">
        {column.tasks.map((task) => (
          <DraggableTaskCard key={task.id} task={task} column={column} />
        ))}
      </div>
    </div>
  );
}

// Draggable Task Card Component
function DraggableTaskCard({ task, column }: { task: Task; column: Column }) {
  const [{ isDragging }, drag] = useDrag({
    type: "task",
    item: { type: "task", id: task.id, columnId: task.columnId },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <div
      ref={drag}
      style={{
        opacity: isDragging ? 0.5 : 1,
        cursor: "move",
      }}
    >
      <TaskCard task={task} column={column} />
    </div>
  );
}

// Add Task Dialog
function AddTaskDialog({
  isOpen,
  onClose,
  columnId,
}: {
  isOpen: boolean;
  onClose: () => void;
  columnId: string;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [priority, setPriority] = useState<"green" | "yellow" | "red">("green");
  const [publishDate, setPublishDate] = useState("");
  const [publishTime, setPublishTime] = useState("");
  const [publishTelegram, setPublishTelegram] = useState(true);
  const [publishVkOk, setPublishVkOk] = useState(true);
  const [publishWebsite, setPublishWebsite] = useState(true);

  const { toast } = useToast();

  const createTaskMutation = useMutation(apiClient.createTask, {
    onSuccess: async (newTask) => {
      // If there's a file to upload, do it after task creation
      if (selectedFile) {
        try {
          setIsUploading(true);
          const base64 = await encodeFileAsBase64DataURL(selectedFile);

          await apiClient.uploadAttachment({
            taskId: newTask.id,
            filename: selectedFile.name,
            base64,
            fileType: selectedFile.type,
            fileSize: selectedFile.size,
          });
        } catch (error) {
          console.error("[AddTaskDialog uploadAttachment] Error Details:", {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString(),
            endpoint: "uploadAttachment",
            context: `Uploading file for new task ${newTask.id}`,
            fileData: {
              name: selectedFile.name,
              size: selectedFile.size,
              type: selectedFile.type,
            },
          });
          toast({
            title: "Ошибка загрузки файла",
            description: "Задача создана, но не удалось загрузить файл",
            variant: "destructive",
          });
        } finally {
          setIsUploading(false);
        }
      }

      queryClient.invalidateQueries(["columns"]);
      toast({
        title: "Задача создана",
        description: "Новая задача успешно добавлена",
      });
      onClose();
      setTitle("");
      setDescription("");
      setSelectedFile(null);
    },
    onError: (error) => {
      console.error("[AddTaskDialog createTask] RPC Error Details:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        endpoint: "createTask",
        context: `Creating task in column ${columnId}`,
        taskData: { title, description, columnId },
      });
      toast({
        title: "Ошибка создания",
        description:
          error instanceof Error ? error.message : "Не удалось создать задачу",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const publishDateTime =
      publishDate && publishTime
        ? new Date(`${publishDate}T${publishTime}:00`)
        : null;

    createTaskMutation.mutate({
      title,
      description,
      columnId,
      publishAt: publishDateTime ? publishDateTime.toISOString() : undefined,
      publishTelegram,
      publishVkOk,
      publishWebsite,
      priority,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="mx-2 sm:mx-auto sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
        aria-describedby="add-task-dialog-description"
      >
        <div id="add-task-dialog-description" className="sr-only">
          Диалог для создания новой задачи с возможностью установки заголовка,
          описания, даты публикации и прикрепления файлов
        </div>
        <DialogHeader>
          <DialogTitle>Добавить новую задачу</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                Заголовок
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Введите заголовок задачи"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Описание
              </label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Введите описание задачи"
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="publishDate" className="text-sm font-medium">
                Дата и время публикации
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    id="publishDate"
                    type="date"
                    value={publishDate}
                    onChange={(e) => setPublishDate(e.target.value)}
                    placeholder="Дата публикации"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    id="publishTime"
                    type="time"
                    value={publishTime}
                    onChange={(e) => setPublishTime(e.target.value)}
                    placeholder="Время публикации"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Платформы публикации
              </label>
              <div className="space-y-2 border rounded-md p-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-2"
                    onClick={() => setPublishTelegram(!publishTelegram)}
                  >
                    {publishTelegram ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    <Share2 className="h-4 w-4" />
                    <span className="text-sm">Telegram</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-2"
                    onClick={() => setPublishVkOk(!publishVkOk)}
                  >
                    {publishVkOk ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    <Share2 className="h-4 w-4" />
                    <span className="text-sm">ВК/ОК</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-2"
                    onClick={() => setPublishWebsite(!publishWebsite)}
                  >
                    {publishWebsite ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    <Globe className="h-4 w-4" />
                    <span className="text-sm">Сайт</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Приоритет</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={priority === "red" ? "default" : "outline"}
                  size="sm"
                  className={
                    priority === "red"
                      ? "bg-red-500 hover:bg-red-600"
                      : "border-red-500 text-red-500 hover:bg-red-50"
                  }
                  onClick={() => setPriority("red")}
                >
                  Высокий
                </Button>
                <Button
                  type="button"
                  variant={priority === "yellow" ? "default" : "outline"}
                  size="sm"
                  className={
                    priority === "yellow"
                      ? "bg-yellow-500 hover:bg-yellow-600"
                      : "border-yellow-500 text-yellow-500 hover:bg-yellow-50"
                  }
                  onClick={() => setPriority("yellow")}
                >
                  Средний
                </Button>
                <Button
                  type="button"
                  variant={priority === "green" ? "default" : "outline"}
                  size="sm"
                  className={
                    priority === "green"
                      ? "bg-green-500 hover:bg-green-600"
                      : "border-green-500 text-green-500 hover:bg-green-50"
                  }
                  onClick={() => setPriority("green")}
                >
                  Низкий
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="attachment" className="text-sm font-medium">
                Вложение
              </label>
              <Input
                id="attachment"
                type="file"
                onChange={handleFileChange}
                className="cursor-pointer"
              />
              {selectedFile && (
                <div className="text-sm flex items-center gap-2 p-2 bg-muted rounded">
                  <File className="h-4 w-4" />
                  <span className="truncate">{selectedFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {selectedFile.size < 1024
                      ? `${selectedFile.size} B`
                      : selectedFile.size < 1024 * 1024
                        ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                        : `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 w-6 p-0"
                    onClick={() => setSelectedFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full sm:w-auto"
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || isUploading}
              className="w-full sm:w-auto"
            >
              {isUploading ? "Загрузка..." : "Создать задачу"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Enhanced Database Status Banner Component
function DatabaseStatusBanner() {
  const { data: dbHealth, isLoading } = useDatabaseHealth();
  const [showDetails, setShowDetails] = useState(false);

  if (isLoading || !dbHealth || dbHealth.healthy) return null;

  const getStatusColor = () => {
    if (dbHealth.status === "missing")
      return "bg-red-50 border-red-200 text-red-800";
    if (dbHealth.status === "unhealthy")
      return "bg-yellow-50 border-yellow-200 text-yellow-800";
    return "bg-destructive/10 border-destructive/20 text-destructive-foreground";
  };

  const getStatusIcon = () => {
    if (dbHealth.status === "missing")
      return <AlertCircle className="h-5 w-5 text-red-600" />;
    if (dbHealth.status === "unhealthy")
      return <Clock className="h-5 w-5 text-yellow-600" />;
    return <AlertCircle className="h-5 w-5" />;
  };

  return (
    <div className={`border p-4 mb-4 rounded-lg ${getStatusColor()}`}>
      <div className="flex items-start gap-3">
        {getStatusIcon()}
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="font-semibold">
              {dbHealth.status === "missing" && "База данных отсутствует"}
              {dbHealth.status === "unhealthy" && "Проблемы с базой данных"}
              {dbHealth.status === "unknown" && "Статус базы данных неизвестен"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="text-current hover:bg-current/10"
            >
              {showDetails ? "Скрыть" : "Подробнее"}
            </Button>
          </div>

          <p className="text-sm mt-1 opacity-90">
            {dbHealth.diagnostics?.message ||
              "Приложение работает в ограниченном режиме."}
          </p>

          {showDetails && (
            <div className="mt-3 p-3 bg-white/50 rounded border">
              <div className="space-y-2 text-sm">
                <div>
                  <strong>Статус:</strong> {dbHealth.status}
                </div>
                <div>
                  <strong>Последняя проверка:</strong>{" "}
                  {new Date(dbHealth.lastCheck).toLocaleString("ru-RU")}
                </div>
                {dbHealth.consecutiveFailures > 0 && (
                  <div>
                    <strong>Неудачных попыток подряд:</strong>{" "}
                    {dbHealth.consecutiveFailures}
                  </div>
                )}

                {dbHealth.needsInfrastructureSupport && (
                  <div className="mt-3 p-2 bg-red-100 border border-red-200 rounded">
                    <p className="font-medium text-red-800">
                      Требуется помощь поддержки
                    </p>
                    <p className="text-red-700 text-xs mt-1">
                      Обратитесь в службу поддержки Adaptive:
                      <br />• Email: support@adaptive.ai
                      <br />• Discord: https://discord.gg/xYX6uC5Syc
                    </p>
                  </div>
                )}

                {dbHealth.diagnostics?.canRetry && (
                  <div className="mt-3 p-2 bg-yellow-100 border border-yellow-200 rounded">
                    <p className="font-medium text-yellow-800">
                      Автоматические попытки восстановления
                    </p>
                    <p className="text-yellow-700 text-xs mt-1">
                      Система автоматически пытается восстановить соединение
                      каждые 30 секунд.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Kanban Board Page
function KanbanBoard() {
  const [addTaskDialogOpen, setAddTaskDialogOpen] = useState(false);
  const [selectedColumnId, setSelectedColumnId] = useState("");

  const { toast } = useToast();
  const { data: dbHealth } = useDatabaseHealth();
  const queryClient = useQueryClient();

  // Enhanced user initialization with better error handling
  useEffect(() => {
    const selectedRole = localStorage.getItem("selectedRole");

    const initializeUser = async () => {
      try {
        if (selectedRole) {
          await apiClient.createUserIfNotExists({ role: selectedRole });
          localStorage.removeItem("selectedRole");
          queryClient.invalidateQueries(["currentUser"]);
        } else {
          await apiClient.createUserIfNotExists();
        }
      } catch (error: any) {
        console.error("[KanbanBoard] User initialization error:", {
          error: error.message,
          selectedRole,
          timestamp: new Date().toISOString(),
        });

        // Don't show error toast for database infrastructure issues
        if (
          !error.message?.includes("404") &&
          !error.message?.includes("not found")
        ) {
          toast({
            title: "Ошибка инициализации",
            description: "Не удалось инициализировать пользователя",
            variant: "destructive",
          });
        }
      }
    };

    initializeUser();
  }, [queryClient, toast]);

  const { data: columnsFromApi = [] } = useQuery(
    ["columns"],
    apiClient.listColumns,
  );

  // Convert API response to our component types
  const columns: Column[] = columnsFromApi.map((column) => ({
    id: column.id,
    name: column.name,
    order: column.order,
    tasks: column.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description || "",
      assigneeId: task.assigneeId,
      assignee: task.assignee,
      columnId: task.columnId,
      createdAt: task.createdAt.toString(),
      updatedAt: task.updatedAt.toString(),
      publishAt: task.publishAt ? task.publishAt.toString() : null,
      publishTelegram: task.publishTelegram,
      publishVkOk: task.publishVkOk,
      publishWebsite: task.publishWebsite,
      priority: task.priority || "green",
    })),
  }));

  const { data: currentUser } = useQuery(
    ["currentUser"],
    apiClient.getCurrentUser,
  );

  const handleAddTask = (columnId: string) => {
    setSelectedColumnId(columnId);
    setAddTaskDialogOpen(true);
  };

  return (
    <div className="p-4">
      <DatabaseStatusBanner />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Канбан-доска</h1>
        <div className="flex items-center gap-2">
          {dbHealth && (
            <div
              className={`text-xs px-2 py-1 rounded-full ${
                dbHealth.healthy
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {dbHealth.healthy ? "БД подключена" : "БД недоступна"}
            </div>
          )}
          {currentUser?.role === "MANAGER" && (
            <Button size="sm" asChild>
              <Link to="/settings">
                <Settings className="h-4 w-4 mr-2" /> Настройки
              </Link>
            </Button>
          )}
        </div>
      </div>

      <DndProvider backend={HTML5Backend}>
        <div
          className="flex gap-4 overflow-x-auto pb-3 min-h-[calc(100vh-120px)] px-1"
          style={{ scrollbarWidth: "thin" }}
        >
          {columns.map((column) => (
            <ColumnComponent
              key={column.id}
              column={column}
              onAddTask={handleAddTask}
            />
          ))}
        </div>
      </DndProvider>

      <AddTaskDialog
        isOpen={addTaskDialogOpen}
        onClose={() => setAddTaskDialogOpen(false)}
        columnId={selectedColumnId}
      />
    </div>
  );
}

// Telegram Bot Settings Component
function TelegramBotSettings() {
  const queryClient = useQueryClient();
  const { data: columns = [] } = useQuery(["columns"], apiClient.listColumns);
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [defaultColumnId, setDefaultColumnId] = useState("");
  const [isActive, setIsActive] = useState(false);
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery(
    ["telegramSettings"],
    apiClient.getTelegramSettings,
  );

  useEffect(() => {
    if (settings) {
      setBotToken(settings.botToken || "");
      setDefaultColumnId(settings.defaultColumnId || "");
      setIsActive(settings.isActive || false);
    }
  }, [settings]);

  const saveTelegramSettingsMutation = useMutation(
    apiClient.saveTelegramSettings,
    {
      onSuccess: () => {
        queryClient.invalidateQueries(["telegramSettings"]);
        toast({
          title: "Настройки сохранены",
          description: "Настройки Telegram-бота успешно сохранены",
        });
      },
      onError: (error) => {
        toast({
          title: "Ошибка",
          description:
            error instanceof Error
              ? error.message
              : "Не удалось сохранить настройки",
          variant: "destructive",
        });
      },
    },
  );

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    saveTelegramSettingsMutation.mutate({
      botToken,
      defaultColumnId,
      isActive,
    });
  };

  if (isLoading) {
    return <div>Загрузка настроек...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" /> Настройки Telegram-бота
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="botToken"
              className="text-sm font-medium flex items-center gap-2"
            >
              <Key className="h-4 w-4" /> Токен бота Telegram
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 ml-2"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </label>
            <div className="border p-4 rounded-md bg-muted/30">
              <div className="flex gap-2 mb-2">
                <Input
                  id="botToken"
                  type={showToken ? "text" : "password"}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="Введите токен бота, полученный от @BotFather"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    // Используем textarea для вставки из буфера обмена
                    const textArea = document.createElement("textarea");
                    textArea.style.position = "fixed";
                    textArea.style.left = "0";
                    textArea.style.top = "0";
                    textArea.style.opacity = "0";
                    document.body.appendChild(textArea);
                    textArea.focus();
                    document.execCommand("paste");
                    const text = textArea.value;
                    document.body.removeChild(textArea);

                    if (text && text.trim()) {
                      setBotToken(text.trim());
                      toast({
                        title: "Токен вставлен",
                        description: "Токен успешно вставлен из буфера обмена",
                      });
                    } else {
                      toast({
                        title: "Буфер пуст",
                        description:
                          "В буфере обмена не найден текст для вставки",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Вставить из буфера
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertCircle className="h-3 w-3" />
                <p>
                  Получите токен бота у{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    @BotFather
                  </a>{" "}
                  в Telegram. Скопируйте токен и вставьте его сюда.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="defaultColumnId" className="text-sm font-medium">
              Колонка для новых задач
            </label>
            <Select value={defaultColumnId} onValueChange={setDefaultColumnId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите колонку" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((column) => (
                  <SelectItem key={column.id} value={column.id}>
                    {column.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Задачи, созданные через Telegram, будут добавляться в эту колонку
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="isActive"
              className="text-sm font-medium cursor-pointer flex items-center gap-2"
            >
              {isActive ? (
                <ToggleRight className="h-6 w-6 text-primary" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-muted-foreground" />
              )}
              <span>Бот {isActive ? "активен" : "отключен"}</span>
            </label>
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="hidden"
            />
          </div>

          <div className="bg-muted p-4 rounded-md">
            <h4 className="font-medium mb-2">Инструкция по настройке:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>
                Создайте бота в Telegram, написав{" "}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  @BotFather
                </a>
              </li>
              <li>Скопируйте полученный токен и вставьте его в поле выше</li>
              <li>
                Выберите колонку, в которую будут добавляться новые задачи
              </li>
              <li>Активируйте бота, переключив тумблер</li>
              <li>Нажмите "Сохранить настройки"</li>
              <li>
                Напишите вашему боту в Telegram, чтобы создать первую задачу
              </li>
            </ol>
          </div>

          <Button type="submit" className="w-full">
            Сохранить настройки
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// Settings Page
function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useQuery(
    ["currentUser"],
    apiClient.getCurrentUser,
  );
  const { data: users = [] } = useQuery(["users"], apiClient.listUsers, {
    enabled: currentUser?.role === "MANAGER",
  });

  const { toast } = useToast();
  const auth = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("EMPLOYEE");

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setEmail(currentUser.email || "");
      setPhone(currentUser.phone || "");
    }
  }, [currentUser]);

  const updateProfileMutation = useMutation(apiClient.updateUserProfile, {
    onSuccess: () => {
      queryClient.invalidateQueries(["currentUser"]);
      toast({
        title: "Профиль обновлен",
        description: "Ваш профиль был успешно обновлен",
      });
    },
  });

  const inviteUserMutation = useMutation(apiClient.inviteNewUser, {
    onSuccess: () => {
      queryClient.invalidateQueries(["users"]);
      setNewUserEmail("");
      toast({
        title: "Пользователь приглашен",
        description: "Приглашение отправлено на указанный email",
      });
    },
  });

  const updateRoleMutation = useMutation(apiClient.updateUserRole, {
    onSuccess: () => {
      queryClient.invalidateQueries(["users"]);
      toast({
        title: "Роль обновлена",
        description: "Роль пользователя успешно изменена",
      });
    },
  });

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({ name, email, phone });
  };

  const handleInviteUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail) return;
    inviteUserMutation.mutate({ email: newUserEmail, role: newUserRole });
  };

  const handleRoleChange = (userId: string, role: string) => {
    updateRoleMutation.mutate({ userId, role });
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Настройки</h1>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-4">
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-2" /> Профиль
          </TabsTrigger>
          {currentUser?.role === "MANAGER" && (
            <TabsTrigger value="users">
              <Users className="h-4 w-4 mr-2" /> Пользователи
            </TabsTrigger>
          )}
          {currentUser?.role === "MANAGER" && (
            <TabsTrigger value="telegram">
              <MessageSquare className="h-4 w-4 mr-2" /> Telegram-бот
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Профиль пользователя</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">
                    Имя
                  </label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ваше имя"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Ваш email"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm font-medium">
                    Телефон
                  </label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ваш телефон"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Роль</label>
                  <Select
                    value={currentUser?.role || "EMPLOYEE"}
                    onValueChange={(value) => {
                      updateProfileMutation.mutate({ role: value });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите роль" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EMPLOYEE">Сотрудник</SelectItem>
                      <SelectItem value="MANAGER">Руководитель</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Руководители могут управлять пользователями и настройками
                    системы
                  </p>
                </div>
                <Button type="submit">Сохранить изменения</Button>
              </form>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => auth.signIn()}>
                <User className="h-4 w-4 mr-2" /> Сменить аккаунт
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {currentUser?.role === "MANAGER" && (
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>Управление пользователями</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleInviteUser} className="space-y-4 mb-6">
                  <div className="space-y-2">
                    <label
                      htmlFor="newUserEmail"
                      className="text-sm font-medium"
                    >
                      Пригласить нового пользователя
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="newUserEmail"
                        type="email"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="Email пользователя"
                        className="flex-1"
                      />
                      <Select
                        value={newUserRole}
                        onValueChange={setNewUserRole}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Роль" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EMPLOYEE">Сотрудник</SelectItem>
                          <SelectItem value="MANAGER">Руководитель</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button type="submit">Пригласить</Button>
                    </div>
                  </div>
                </form>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Список пользователей</h3>
                  <div className="border rounded-md">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-2 text-left">Имя / Email</th>
                          <th className="px-4 py-2 text-left">Роль</th>
                          <th className="px-4 py-2 text-right">Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr key={user.id} className="border-b">
                            <td className="px-4 py-2">
                              <div>{user.name || "Без имени"}</div>
                              <div className="text-sm text-muted-foreground">
                                {user.email}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <Badge
                                variant={
                                  user.role === "MANAGER"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {user.role === "MANAGER"
                                  ? "Руководитель"
                                  : "Сотрудник"}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <Select
                                value={user.role}
                                onValueChange={(value) =>
                                  handleRoleChange(user.id, value)
                                }
                              >
                                <SelectTrigger className="w-[140px]">
                                  <SelectValue placeholder="Изменить роль" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="EMPLOYEE">
                                    Сотрудник
                                  </SelectItem>
                                  <SelectItem value="MANAGER">
                                    Руководитель
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {currentUser?.role === "MANAGER" && (
          <TabsContent value="telegram">
            <TelegramBotSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// Auth Provider Wrapper
function AuthWrapper({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  if (auth.status === "unauthenticated") {
    return <LoginPage />;
  }

  return <>{children}</>;
}

// Diagnostic: extend window for debug
declare global {
  interface Window {
    __content_plan_debug?: boolean;
  }
}

// Content Plan Page
function ContentPlanPage() {
  const queryClient = useQueryClient();
  const { data: dbHealth } = useDatabaseHealth();

  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("week");
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const date = new Date();
    // Set to Monday of current week
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<
    string[]
  >([]);

  const [draggedTask, setDraggedTask] = useState<any>(null);

  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const { toast } = useToast();

  // Missing function to handle task click
  const handleTaskClick = (task: any) => {
    // For now, just log the task click - this can be expanded later
    console.log("Task clicked:", task.id, task.title);
    // TODO: Implement task detail modal or navigation
  };

  // Mutation to return a task to Kanban
  // const returnTaskToKanbanMutation = useMutation(
  //   (params: { taskId: string }) => apiClient.returnTaskToKanban(params),
  //   {
  //     onSuccess: () => {
  //       queryClient.invalidateQueries(["contentPlanTasks"]);
  //       queryClient.invalidateQueries(["columns"]);
  //       toast({
  //         title: "Задача возвращена",
  //         description: "Задача возвращена в канбан-доску",
  //       });
  //     },
  //     onError: (error) => {
  //       console.error("[ContentPlan returnTaskToKanban] RPC Error Details:", {
  //         error: error instanceof Error ? error.message : String(error),
  //         stack: error instanceof Error ? error.stack : undefined,
  //         timestamp: new Date().toISOString(),
  //         endpoint: "returnTaskToKanban",
  //         context: "Content plan task return to kanban",
  //       });
  //       toast({
  //         title: "Ошибка",
  //         description:
  //           error instanceof Error
  //             ? error.message
  //             : "Не удалось вернуть задачу в канбан",
  //         variant: "destructive",
  //       });
  //     },
  //   },
  // );

  // const deleteContentPlanTaskMutation = useMutation(
  //   (params: { id: string }) => apiClient.deleteContentPlanTask(params),
  //   {
  //     onSuccess: () => {
  //       queryClient.invalidateQueries(["contentPlanTasks"]);
  //       toast({
  //         title: "Задача удалена",
  //         description: "Задача удалена из контент-плана",
  //       });
  //     },
  //     onError: (error) => {
  //       console.error(
  //         "[ContentPlan deleteContentPlanTask] RPC Error Details:",
  //         {
  //           error: error instanceof Error ? error.message : String(error),
  //           stack: error instanceof Error ? error.stack : undefined,
  //           timestamp: new Date().toISOString(),
  //           endpoint: "deleteContentPlanTask",
  //           context: "Content plan task deletion",
  //         },
  //       );
  //       toast({
  //         title: "Ошибка",
  //         description:
  //           error instanceof Error
  //             ? error.message
  //             : "Не удалось удалить задачу",
  //         variant: "destructive",
  //       });
  //     },
  //   },
  // );

  // Mutation to update content plan task
  const updateContentPlanTaskMutation = useMutation(
    (params: {
      id: string;
      publishAt?: string;
      publishTelegram?: boolean;
      publishVkOk?: boolean;
      publishWebsite?: boolean;
    }) => apiClient.updateContentPlanTask(params),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(["contentPlanTasks"]);
        toast({
          title: "Задача обновлена",
          description: "Настройки публикации обновлены",
        });
      },
      onError: (error) => {
        console.error(
          "[ContentPlan updateContentPlanTask] RPC Error Details:",
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString(),
            endpoint: "updateContentPlanTask",
            context: "Content plan task update",
          },
        );
        toast({
          title: "Ошибка",
          description:
            error instanceof Error
              ? error.message
              : "Не удалось обновить задачу",
          variant: "destructive",
        });
      },
    },
  );

  // Получаем список задач контент-плана
  const { data: contentPlanTasks = [] } = useQuery(
    ["contentPlanTasks"],
    apiClient.listContentPlanTasks,
  );

  // Получаем список колонок для навигации к канбан-доске

  // Навигация по датам
  const handlePrevPeriod = () => {
    const prevDate = new Date(currentDate);
    if (viewMode === "day") {
      prevDate.setDate(prevDate.getDate() - 1);
    } else if (viewMode === "week") {
      prevDate.setDate(prevDate.getDate() - 7);
    } else if (viewMode === "month") {
      prevDate.setMonth(prevDate.getMonth() - 1);
    }
    setCurrentDate(prevDate);
  };

  const handleNextPeriod = () => {
    const nextDate = new Date(currentDate);
    if (viewMode === "day") {
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (viewMode === "week") {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (viewMode === "month") {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }
    setCurrentDate(nextDate);
  };

  const togglePlatformFilter = (platform: string) => {
    setSelectedPlatformFilter((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform],
    );
  };

  // Форматирование даты для отображения
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      weekday: "long",
    }).format(date);
  };

  // Проверка, является ли дата выходным
  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 - воскресенье, 6 - суббота
  };

  // Получаем даты для текущего периода просмотра
  const periodDates = useMemo<Date[]>(() => {
    const dates: Date[] = [];
    const startDate = new Date(currentDate);

    if (viewMode === "day") {
      dates.push(new Date(startDate));
    } else if (viewMode === "week") {
      // Неделя с понедельника по воскресенье
      for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        dates.push(date);
      }
    } else if (viewMode === "month") {
      // Устанавливаем на первое число месяца
      startDate.setDate(1);
      const month = startDate.getMonth();
      const currentMonthDate = new Date(startDate);

      // Добавляем все дни текущего месяца
      while (currentMonthDate.getMonth() === month) {
        dates.push(new Date(currentMonthDate));
        currentMonthDate.setDate(currentMonthDate.getDate() + 1);
      }
    }

    return dates;
  }, [currentDate, viewMode]);

  // Фильтрация задач для выбранного периода и платформ
  const filteredTasks = useMemo(() => {
    // Фильтрация по периоду
    let filtered = contentPlanTasks.filter((task: any) => {
      if (!task.publishAt) return false;
      const taskDate = new Date(task.publishAt);

      if (viewMode === "day") {
        return (
          taskDate.getDate() === currentDate.getDate() &&
          taskDate.getMonth() === currentDate.getMonth() &&
          taskDate.getFullYear() === currentDate.getFullYear()
        );
      } else if (viewMode === "week") {
        // Проверяем, входит ли дата в текущую неделю
        const startOfWeek = new Date(currentDate);
        const endOfWeek = new Date(currentDate);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        return taskDate >= startOfWeek && taskDate <= endOfWeek;
      } else {
        // month
        return (
          taskDate.getMonth() === currentDate.getMonth() &&
          taskDate.getFullYear() === currentDate.getFullYear()
        );
      }
    });

    // Фильтрация по платформам
    if (selectedPlatformFilter.length > 0) {
      filtered = filtered.filter((task: any) => {
        if (
          selectedPlatformFilter.includes("telegram") &&
          task.publishTelegram
        ) {
          return true;
        }
        if (selectedPlatformFilter.includes("vkok") && task.publishVkOk) {
          return true;
        }
        if (selectedPlatformFilter.includes("website") && task.publishWebsite) {
          return true;
        }
        return false;
      });
    }

    return filtered;
  }, [contentPlanTasks, currentDate, viewMode, selectedPlatformFilter]);

  // Получение задач для определенного временного слота и даты
  const getTasksForTimeSlot = (date: Date, timeSlot: string) => {
    return filteredTasks.filter((task: any) => {
      if (!task.publishAt) return false;
      const taskDate = new Date(task.publishAt);
      const taskTimeSlot = `${taskDate.getHours()}:${taskDate.getMinutes().toString().padStart(2, "0")}`;

      return (
        taskDate.getDate() === date.getDate() &&
        taskDate.getMonth() === date.getMonth() &&
        taskDate.getFullYear() === date.getFullYear() &&
        taskTimeSlot === timeSlot
      );
    });
  };

  // Проверка, можно ли удалить задачу (старше 8 дней)

  // Временные слоты для расписания (с получасовыми интервалами)
  const timeSlots = useMemo<string[]>(() => {
    const slots: string[] = [];
    for (let hour = 9; hour <= 18; hour++) {
      slots.push(`${hour}:00`);
      if (hour < 18) slots.push(`${hour}:30`);
    }
    return slots;
  }, []);

  // Обработчик удаления задачи

  // Обработчики для drag-and-drop функциональности
  const handleDragStart = (task: any) => {
    setDraggedTask(task);
  };

  const handleDragOver = (e: React.DragEvent, date: Date, timeSlot: string) => {
    e.preventDefault();
    const target = `${date.toDateString()}-${timeSlot}`;
    setDragOverTarget(target);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're actually leaving the drop zone
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverTarget(null);
    }
  };

  const handleDrop = (e: React.DragEvent, date: Date, timeSlot: string) => {
    e.preventDefault();
    setDragOverTarget(null);

    if (draggedTask) {
      // Parse time slot and create new date
      const [hoursRaw, minutesRaw] = timeSlot.split(":");
      const hours = parseInt(hoursRaw ?? "0", 10);
      const minutes = parseInt(minutesRaw ?? "0", 10);
      const newDate = new Date(date);
      newDate.setHours(hours, minutes, 0, 0);

      // Update the task with new publish date and time
      updateContentPlanTaskMutation.mutate({
        id: draggedTask.id,
        publishAt: newDate.toISOString(),
      });

      setDraggedTask(null);
    }
  };

  // Handle saving edited task

  // Export content plan for current month
  const handleExportContentPlan = () => {
    const startDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );

    // For now, just show a toast. In a real implementation, this would trigger a download
    toast({
      title: "Экспорт контент-плана",
      description: `Экспорт данных за ${startDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })} будет реализован в следующей версии`,
    });
  };

  return (
    <div className="p-4">
      <DatabaseStatusBanner />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Контент-план</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleExportContentPlan}>
            <Download className="h-4 w-4 mr-2" /> Выгрузить контент-план
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/">
              <Layout className="h-4 w-4 mr-2" /> Канбан-доска
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/settings">
              <Settings className="h-4 w-4 mr-2" /> Настройки
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="sm" onClick={handlePrevPeriod}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Предыдущий{" "}
            {viewMode === "day"
              ? "день"
              : viewMode === "week"
                ? "неделя"
                : "месяц"}
          </Button>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            <h2 className="text-lg font-medium">
              {viewMode === "day" && formatDate(currentDate)}
              {viewMode === "week" && (
                <span>
                  {new Intl.DateTimeFormat("ru-RU", {
                    day: "2-digit",
                    month: "2-digit",
                  }).format(periodDates[0])}{" "}
                  -
                  {new Intl.DateTimeFormat("ru-RU", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }).format(periodDates[periodDates.length - 1])}
                </span>
              )}
              {viewMode === "month" && (
                <span>
                  {new Intl.DateTimeFormat("ru-RU", {
                    month: "long",
                    year: "numeric",
                  }).format(currentDate)}
                </span>
              )}
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={handleNextPeriod}>
            Следующий{" "}
            {viewMode === "day"
              ? "день"
              : viewMode === "week"
                ? "неделя"
                : "месяц"}{" "}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4 justify-between">
          <div className="flex gap-2">
            <Button
              variant={viewMode === "day" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("day")}
            >
              День
            </Button>
            <Button
              variant={viewMode === "week" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("week")}
            >
              Неделя
            </Button>
            <Button
              variant={viewMode === "month" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("month")}
            >
              Месяц
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant={
                selectedPlatformFilter.includes("telegram")
                  ? "default"
                  : "outline"
              }
              size="sm"
              onClick={() => togglePlatformFilter("telegram")}
            >
              <Share2 className="h-4 w-4 mr-1" /> Telegram
            </Button>
            <Button
              variant={
                selectedPlatformFilter.includes("vkok") ? "default" : "outline"
              }
              size="sm"
              onClick={() => togglePlatformFilter("vkok")}
            >
              <Share2 className="h-4 w-4 mr-1" /> ВК/ОК
            </Button>
            <Button
              variant={
                selectedPlatformFilter.includes("website")
                  ? "default"
                  : "outline"
              }
              size="sm"
              onClick={() => togglePlatformFilter("website")}
            >
              <Globe className="h-4 w-4 mr-1" /> Сайт
            </Button>
          </div>
        </div>
      </div>

      {/* Enhanced content plan status */}
      {!dbHealth?.healthy && (
        <div className="bg-muted p-6 rounded-lg text-center mb-6 border">
          <div className="flex flex-col items-center gap-3">
            {dbHealth?.status === "missing" ? (
              <AlertCircle className="h-8 w-8 text-red-500" />
            ) : (
              <Clock className="h-8 w-8 text-yellow-500" />
            )}
            <div>
              <p className="font-medium text-lg mb-2">
                {dbHealth?.status === "missing"
                  ? "Контент-план недоступен"
                  : "Контент-план работает в ограниченном режиме"}
              </p>
              <p className="text-muted-foreground text-sm">
                {dbHealth?.status === "missing"
                  ? "База данных отсутствует. Для восстановления обратитесь в службу поддержки Adaptive."
                  : "Временные проблемы с подключением к базе данных. Показаны демонстрационные данные."}
              </p>
              {dbHealth?.status === "missing" && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-left">
                  <p className="font-medium text-red-800 text-sm">
                    Контакты поддержки:
                  </p>
                  <p className="text-red-700 text-xs mt-1">
                    • Email: support@adaptive.ai
                    <br />• Discord: https://discord.gg/xYX6uC5Syc
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {viewMode === "day" && (
        <div className="bg-card rounded-lg shadow">
          <div className="grid grid-cols-1 divide-y">
            {timeSlots.map((timeSlot) => {
              const tasks = getTasksForTimeSlot(currentDate, timeSlot);
              return (
                <div
                  key={timeSlot}
                  className={`p-4 flex transition-colors ${
                    dragOverTarget ===
                    `${currentDate.toDateString()}-${timeSlot}`
                      ? "bg-primary/20 border-primary border-2 border-dashed"
                      : "border-2 border-transparent"
                  }`}
                  onDragOver={(e) => handleDragOver(e, currentDate, timeSlot)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, currentDate, timeSlot)}
                >
                  <div className="w-20 flex-shrink-0 font-medium">
                    {timeSlot}
                  </div>
                  <div className="flex-1">
                    {tasks.length > 0 ? (
                      <div className="space-y-2">
                        {tasks.map((task) => (
                          <div
                            key={task.id}
                            className="bg-muted p-3 rounded-md cursor-move hover:bg-accent/10"
                            draggable
                            onDragStart={() => handleDragStart(task)}
                            onClick={() => handleTaskClick(task)}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <p className="font-medium">
                                {task.description
                                  ? task.description.split(".")[0] + "."
                                  : task.title}
                              </p>
                              {/* Add any badge info if needed */}
                            </div>
                            <div className="flex gap-2">
                              {task.publishTelegram && (
                                <Badge
                                  variant="secondary"
                                  className="flex items-center gap-1"
                                >
                                  <Share2 className="h-3 w-3" />
                                  <span className="text-xs">Telegram</span>
                                </Badge>
                              )}
                              {task.publishVkOk && (
                                <Badge
                                  variant="secondary"
                                  className="flex items-center gap-1"
                                >
                                  <Share2 className="h-3 w-3" />
                                  <span className="text-xs">ВК/ОК</span>
                                </Badge>
                              )}
                              {task.publishWebsite && (
                                <Badge
                                  variant="secondary"
                                  className="flex items-center gap-1"
                                >
                                  <Globe className="h-3 w-3" />
                                  <span className="text-xs">Сайт</span>
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        Нет запланированных публикаций
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === "week" && (
        <div className="bg-card rounded-lg shadow border overflow-x-auto">
          <div className="min-w-[700px] md:min-w-[900px]">
            <div className="grid grid-cols-8 border-b">
              {/* Заголовок таблицы с днями недели */}
              <div className="p-2 md:p-3 font-medium text-center bg-muted/30 border-r-2 border-border w-[56px] md:w-[80px] flex-shrink-0">
                Время
              </div>
              {periodDates.map((date, index) => (
                <div
                  key={index}
                  className={`p-2 md:p-3 font-medium text-center border-r-2 border-border last:border-r-0 ${
                    isWeekend(date) ? "bg-muted/50" : "bg-muted/20"
                  }`}
                >
                  <div className="text-sm md:text-base">
                    {new Intl.DateTimeFormat("ru-RU", {
                      weekday: "short",
                      day: "numeric",
                      month: "numeric",
                    }).format(date)}
                  </div>
                </div>
              ))}
            </div>
            {/* Строки для каждого временного слота */}
            {timeSlots.map((timeSlot) => (
              <div
                key={timeSlot}
                className="grid grid-cols-8 border-b last:border-b-0"
              >
                <div className="p-2 md:p-3 font-medium bg-muted/20 border-r-2 border-border w-[56px] md:w-[80px] flex-shrink-0 text-sm md:text-base">
                  {timeSlot}
                </div>
                {periodDates.map((date, index) => {
                  const tasks = getTasksForTimeSlot(date, timeSlot);
                  const isDropTarget =
                    dragOverTarget === `${date.toDateString()}-${timeSlot}`;
                  return (
                    <div
                      key={index}
                      className={`p-1 md:p-2 transition-all duration-200 border-r-2 border-border last:border-r-0 min-h-[60px] md:min-h-[80px] ${
                        isWeekend(date) ? "bg-muted/10" : ""
                      } ${
                        isDropTarget
                          ? "bg-primary/10 border-primary border-2 border-dashed shadow-md"
                          : dragOverTarget
                            ? "border-2 border-dashed border-muted-foreground/30 bg-muted/30"
                            : "border-2 border-transparent hover:bg-muted/20"
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverTarget(`${date.toDateString()}-${timeSlot}`);
                      }}
                      onDragLeave={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX;
                        const y = e.clientY;
                        if (
                          x < rect.left ||
                          x > rect.right ||
                          y < rect.top ||
                          y > rect.bottom
                        ) {
                          setDragOverTarget(null);
                        }
                      }}
                      onDrop={(e) => handleDrop(e, date, timeSlot)}
                    >
                      {tasks.length > 0 ? (
                        <div className="space-y-1 md:space-y-2">
                          {tasks.map((task) => (
                            <div
                              key={task.id}
                              className="bg-muted p-1 md:p-2 rounded-md cursor-move hover:bg-accent/10 text-xs md:text-sm border shadow-sm transition-colors"
                              draggable
                              onDragStart={() => handleDragStart(task)}
                              onClick={() => handleTaskClick(task)}
                            >
                              <p className="font-medium line-clamp-2 mb-1">
                                {task.description
                                  ? task.description.split(".")[0] + "."
                                  : task.title}
                              </p>
                              <div className="flex gap-1 flex-wrap">
                                {task.publishTelegram && (
                                  <Badge
                                    variant="secondary"
                                    className="flex items-center gap-1 text-xs py-0 px-1"
                                  >
                                    <Share2 className="h-2 w-2 md:h-3 md:w-3" />
                                    <span className="hidden md:inline">ТГ</span>
                                  </Badge>
                                )}
                                {task.publishVkOk && (
                                  <Badge
                                    variant="secondary"
                                    className="flex items-center gap-1 text-xs py-0 px-1"
                                  >
                                    <Share2 className="h-2 w-2 md:h-3 md:w-3" />
                                    <span className="hidden md:inline">ВК</span>
                                  </Badge>
                                )}
                                {task.publishWebsite && (
                                  <Badge
                                    variant="secondary"
                                    className="flex items-center gap-1 text-xs py-0 px-1"
                                  >
                                    <Globe className="h-2 w-2 md:h-3 md:w-3" />
                                    <span className="hidden md:inline">С</span>
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        isDropTarget && (
                          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                            Отпустите здесь
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === "month" && (
        <div className="bg-card rounded-lg shadow">
          {/* Календарь на месяц */}
          <div className="grid grid-cols-7 gap-1 p-2">
            {/* Заголовки дней недели */}
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
              <div key={day} className="text-center font-medium p-2">
                {day}
              </div>
            ))}

            {/* Расчет дней для отображения в сетке календаря */}
            {(() => {
              try {
                const firstDay = new Date(
                  currentDate.getFullYear(),
                  currentDate.getMonth(),
                  1,
                );
                const lastDay = new Date(
                  currentDate.getFullYear(),
                  currentDate.getMonth() + 1,
                  0,
                );
                let firstDayOfWeek = firstDay.getDay();
                firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
                const daysInMonth = lastDay.getDate();
                const totalCells =
                  Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;
                const cells: JSX.Element[] = [];

                // Заполняем пустые ячейки до начала месяца
                for (let i = 0; i < firstDayOfWeek; i++) {
                  cells.push(
                    <div
                      key={`empty-start-${i}`}
                      className="p-2 min-h-[100px] bg-muted/10 rounded-md"
                    ></div>,
                  );
                }

                // Заполняем дни месяца
                for (let day = 1; day <= daysInMonth; day++) {
                  const date = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                    day,
                  );
                  // Найти задачи на этот день из filteredTasks
                  const tasksForDay = Array.isArray(filteredTasks)
                    ? filteredTasks.filter((task: any) => {
                        if (!task || !task.publishAt) return false;
                        const taskDate = new Date(task.publishAt);
                        return (
                          taskDate.getDate() === day &&
                          taskDate.getMonth() === currentDate.getMonth() &&
                          taskDate.getFullYear() === currentDate.getFullYear()
                        );
                      })
                    : [];

                  const isWeekendDay =
                    date.getDay() === 0 || date.getDay() === 6;
                  const isToday =
                    new Date().toDateString() === date.toDateString();

                  cells.push(
                    <div
                      key={`day-${day}`}
                      className={`p-1 md:p-2 min-h-[100px] md:min-h-[120px] rounded-md border-2 transition-all duration-200 ${isWeekendDay ? "bg-muted/10" : ""} ${isToday ? "border-primary bg-primary/5" : "border-border"} hover:bg-muted/20`}
                    >
                      <div className="font-medium mb-1">{day}</div>
                      <div className="space-y-1 overflow-y-auto max-h-[90px] text-xs">
                        {tasksForDay.length > 0 &&
                          tasksForDay.map((task: any) => {
                            if (!task) return null;
                            const displayTitle = task.description
                              ? task.description.split(".")[0] + "."
                              : task.title;
                            const shortTitle =
                              displayTitle.length > 30
                                ? displayTitle.substring(0, 30) + "..."
                                : displayTitle;
                            return (
                              <div
                                key={task.id}
                                className="bg-muted p-1 rounded cursor-pointer hover:bg-accent/10 border"
                                onClick={() => handleTaskClick(task)}
                              >
                                <div className="font-medium text-xs mb-1">
                                  {task.publishAt
                                    ? new Date(
                                        task.publishAt,
                                      ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                    : ""}
                                </div>
                                <div
                                  className="text-xs truncate mb-1"
                                  title={displayTitle}
                                >
                                  {shortTitle}
                                </div>
                                <div className="flex gap-1 justify-center">
                                  {task.publishTelegram && (
                                    <Badge
                                      variant="secondary"
                                      className="text-xs px-1 py-0"
                                    >
                                      ТГ
                                    </Badge>
                                  )}
                                  {task.publishVkOk && (
                                    <Badge
                                      variant="secondary"
                                      className="text-xs px-1 py-0"
                                    >
                                      ВК
                                    </Badge>
                                  )}
                                  {task.publishWebsite && (
                                    <Badge
                                      variant="secondary"
                                      className="text-xs px-1 py-0"
                                    >
                                      Сайт
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>,
                  );
                }
                // Заполняем пустые ячейки после конца месяца
                const remainingCells =
                  totalCells - (firstDayOfWeek + daysInMonth);
                for (let i = 0; i < remainingCells; i++) {
                  cells.push(
                    <div
                      key={`empty-end-${i}`}
                      className="p-2 min-h-[100px] bg-muted/10 rounded-md"
                    ></div>,
                  );
                }
                return cells;
              } catch (e) {
                return (
                  <div className="text-destructive">
                    Ошибка отрисовки календаря месяца:{" "}
                    {e instanceof Error ? e.message : String(e)}
                  </div>
                );
              }
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// Main Navigation Component
function MainNav() {
  const location = useLocation();
  const { data: currentUser } = useQuery(
    ["currentUser"],
    apiClient.getCurrentUser,
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="border-b px-4 py-2 bg-background">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-bold text-lg">
            КанбанПро
          </Link>
          <div className="hidden md:flex items-center gap-4">
            <Link
              to="/"
              className={`flex items-center gap-1 text-sm ${location.pathname === "/" ? "text-primary font-medium" : "text-muted-foreground"}`}
            >
              <Layout className="h-4 w-4" />
              <span>Канбан-доска</span>
            </Link>
            <Link
              to="/publications"
              className={`flex items-center gap-1 text-sm ${location.pathname === "/publications" ? "text-primary font-medium" : "text-muted-foreground"}`}
            >
              <Calendar className="h-4 w-4" />
              <span>Контент-план</span>
            </Link>
            <Link
              to="/settings"
              className={`flex items-center gap-1 text-sm ${location.pathname === "/settings" ? "text-primary font-medium" : "text-muted-foreground"}`}
            >
              <Settings className="h-4 w-4" />
              <span>Настройки</span>
            </Link>
          </div>
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <div className="hidden md:flex items-center gap-2">
          {currentUser?.name && (
            <div className="text-sm mr-2">{currentUser.name}</div>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link to="/settings">
              <User className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-2 py-2 border-t">
          <div className="flex flex-col gap-2">
            <Link
              to="/"
              className={`flex items-center gap-2 p-2 rounded-md ${location.pathname === "/" ? "bg-muted font-medium" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Layout className="h-4 w-4" />
              <span>Канбан-доска</span>
            </Link>
            <Link
              to="/publications"
              className={`flex items-center gap-2 p-2 rounded-md ${location.pathname === "/publications" ? "bg-muted font-medium" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Calendar className="h-4 w-4" />
              <span>Контент-план</span>
            </Link>
            <Link
              to="/settings"
              className={`flex items-center gap-2 p-2 rounded-md ${location.pathname === "/settings" ? "bg-muted font-medium" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Settings className="h-4 w-4" />
              <span>Настройки</span>
            </Link>
            <div className="flex items-center gap-2 p-2 mt-2 border-t pt-2">
              <User className="h-4 w-4" />
              <span>{currentUser?.name || "Профиль"}</span>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

// Main App Component
// ErrorBoundary Component to catch runtime errors and display error messages
class ErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
  },
  { hasError: boolean; error: any; errorInfo: any }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
    // Log the error details for debugging
    console.error("[ErrorBoundary] React Error Caught:", {
      error: error.toString(),
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      context: "React component error boundary",
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-destructive/10 text-foreground p-8">
          <div className="bg-card text-card-foreground p-6 rounded-lg shadow-lg max-w-2xl w-full">
            <h1 className="text-2xl font-bold mb-4 text-destructive">
              Произошла ошибка на странице
            </h1>
            <div className="bg-muted p-4 rounded mb-4 text-left overflow-x-auto">
              <pre className="whitespace-pre-wrap text-sm font-mono">
                {this.state.error && this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </div>
            <p className="text-muted-foreground mb-4">
              Пожалуйста, обновите страницу или обратитесь к разработчику.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => window.location.reload()}>
                Обновить страницу
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  this.setState({
                    hasError: false,
                    error: null,
                    errorInfo: null,
                  })
                }
              >
                Попробовать снова
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Общая функция для обработки onError (выводит тост и логирует ошибку)

export default function App() {
  return (
    <Router>
      <ErrorBoundary>
        <AuthWrapper>
          <div className="min-h-screen bg-background text-foreground">
            <MainNav />
            <Routes>
              <Route path="/" element={<KanbanBoard />} />
              <Route
                path="/publications"
                element={
                  <ProtectedRoute>
                    <ContentPlanPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </AuthWrapper>
      </ErrorBoundary>
    </Router>
  );
}
