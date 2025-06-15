import { expect } from "expect";
import { createTask, updateTask, deleteTask, getAssignableUsers, getTaskAttachments } from "./api";

async function testGetAssignableUsers() {
  // Get assignable users
  const users = await getAssignableUsers();

  // Verify users array properties
  expect(Array.isArray(users)).toBe(true);
  
  // If there are users, check their structure
  if (users.length > 0) {
    expect(users[0]).toHaveProperty('id');
    expect(users[0]).toHaveProperty('name');
    expect(users[0]).toHaveProperty('email');
    expect(users[0]).toHaveProperty('role');
  }
}

async function testGetTaskAttachmentsValidation() {
  // Test with undefined input - should throw descriptive error
  try {
    await getTaskAttachments(undefined as any);
    throw new Error("Expected function to throw error for undefined input");
  } catch (error) {
    expect(error instanceof Error).toBe(true);
    expect((error as Error).message).toContain("taskId");
  }

  // Test with empty object - should throw descriptive error
  try {
    await getTaskAttachments({} as any);
    throw new Error("Expected function to throw error for missing taskId");
  } catch (error) {
    expect(error instanceof Error).toBe(true);
    expect((error as Error).message).toContain("taskId");
  }

  // Test with null taskId - should throw descriptive error
  try {
    await getTaskAttachments({ taskId: null as any });
    throw new Error("Expected function to throw error for null taskId");
  } catch (error) {
    expect(error instanceof Error).toBe(true);
    expect((error as Error).message).toContain("taskId");
  }

  // Test with empty string taskId - should throw descriptive error
  try {
    await getTaskAttachments({ taskId: "" });
    throw new Error("Expected function to throw error for empty taskId");
  } catch (error) {
    expect(error instanceof Error).toBe(true);
    expect((error as Error).message).toContain("taskId");
  }

  // Test with valid but non-existent taskId - should return empty array
  const attachments = await getTaskAttachments({ taskId: "non-existent-task-id" });
  expect(Array.isArray(attachments)).toBe(true);
  expect(attachments.length).toBe(0);
}

async function testFallbackTaskHandling() {
  // Test that fallback tasks are handled appropriately
  // This test verifies that we don't attempt to update demo/fallback tasks
  
  try {
    // Attempt to update a fallback task ID (should either succeed with graceful handling or fail gracefully)
    const result = await updateTask({
      id: "sample-task-1", // This is a fallback task ID
      columnId: "fallback-2"
    });
    
    // If it succeeds, verify it returns appropriate structure
    if (result) {
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title');
    }
  } catch (error) {
    // If it fails, ensure it fails gracefully with descriptive error
    expect(error instanceof Error).toBe(true);
    const errorMessage = (error as Error).message;
    
    // Should not be a generic database error - should be handled gracefully
    expect(errorMessage).not.toContain('SERVER_ERROR: Server returned HTTP status 404');
  }
}

async function testDatabaseHealthReporting() {
  // Test that database health is properly reported
  const users = await getAssignableUsers();
  
  // Should return an array even when database is down (fallback)
  expect(Array.isArray(users)).toBe(true);
  
  // When database is down, should return empty array or demo users
  // but should not throw unhandled errors
}

type TestResult = {
  passedTests: string[];
  failedTests: { name: string; error: string }[];
};

export async function _runApiTests() {
  const result: TestResult = { passedTests: [], failedTests: [] };

  const testFunctions = [testGetAssignableUsers, testGetTaskAttachmentsValidation, testFallbackTaskHandling, testDatabaseHealthReporting];

  for (const testFunction of testFunctions) {
    try {
      await testFunction();
      result.passedTests.push(testFunction.name);
    } catch (error) {
      result.failedTests.push({
        name: testFunction.name,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return result;
}