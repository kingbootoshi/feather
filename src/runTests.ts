import inquirer from 'inquirer';
import { exec, ExecException } from 'child_process';
import { logger } from './logger/logger';
import path from 'path';

// Define interface for test file configuration
interface TestFile {
  path: string;
  description: string;
}

interface TestFiles {
  [key: string]: TestFile;
}

// Define available test files and their descriptions
const TEST_FILES: TestFiles = {
  'Tool Test': {
    path: './tests/toolTest.ts',
    description: 'Tests the calculator tool functionality with a math tutor agent'
  },
  'Structured Output Test': {
    path: './tests/structuredtest.ts',
    description: 'Tests structured output functionality with a Q&A agent'
  },
  'Chat Room Test': {
    path: './tests/chatRoomTest.ts',
    description: 'Tests the chat room functionality with a dramatic conversation agent'
  }
};

/**
 * Executes a TypeScript file using bun.
 * @param filePath - Path to the TypeScript file to execute.
 * Returns a Promise that resolves once the command finishes.
 */
async function executeTest(filePath: string): Promise<void> {
  return new Promise((resolve) => {
    // Use bun to execute the TypeScript file directly
    const fullPath = path.join(__dirname, filePath);
    // Construct the command to run the file
    const command = `LOG_LEVEL=debug bun run ${fullPath}`;
    
    logger.info(`Executing test: ${command}, check localhost:3000 for GUI`);
    
    // Execute the command with environment variables set
    exec(command, { 
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
      env: {
        ...process.env,
        LOG_LEVEL: 'debug',
        NODE_ENV: process.env.NODE_ENV || 'development',
        FORCE_COLOR: 'true'
      }
    }, (error: ExecException | null, stdout: string, stderr: string) => {
      // Always show output for debugging
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);

      if (error && error.code !== 0) {
        logger.error({ 
          error: {
            code: error.code,
            message: error.message
          }
        }, `Error executing test ${filePath}`);
      }

      resolve();
    });
  });
}

/**
 * Displays the main menu using inquirer
 * and handles the user's test selection.
 */
async function showMenu(): Promise<void> {
  try {
    const { testChoice } = await inquirer.prompt<{ testChoice: string }>([
      {
        type: 'list',
        name: 'testChoice',
        message: 'Select a test to run:',
        choices: [
          ...Object.entries(TEST_FILES).map(([name, info]) => ({
            name: `${name} - ${info.description}`,
            value: info.path
          })),
          { name: 'Exit', value: 'exit' }
        ]
      }
    ]);

    if (testChoice === 'exit') {
      logger.info('Exiting test runner');
      process.exit(0);
    }

    // Execute the chosen test
    await executeTest(testChoice);
    
    // Ask if user wants to run another test
    const { runAnother } = await inquirer.prompt<{ runAnother: boolean }>([
      {
        type: 'confirm',
        name: 'runAnother',
        message: 'Would you like to run another test?',
        default: true
      }
    ]);

    if (runAnother) {
      await showMenu();
    } else {
      logger.info('Exiting test runner');
      process.exit(0);
    }

  } catch (error) {
    logger.error({ error }, 'Error in test runner menu');
    process.exit(1);
  }
}

// Start the CLI menu if this file is run directly
if (require.main === module) {
  logger.info('Starting Feather test runner');
  showMenu().catch(error => {
    logger.error({ error }, 'Fatal error in test runner');
    process.exit(1);
  });
}