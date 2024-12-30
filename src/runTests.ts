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
 * Executes a TypeScript file using bun
 * @param filePath - Path to the TypeScript file to execute
 */
async function executeTest(filePath: string): Promise<void> {
  return new Promise((resolve) => {
    // Use bun to execute the TypeScript file directly
    const fullPath = path.join(__dirname, filePath);
    // Execute without piping to allow native logger output
    const command = `LOG_LEVEL=debug bun run ${fullPath}`;
    
    logger.info(`Executing test: ${command}, check localhost:3000 for GUI`);
    
    // Use shell: true to properly handle environment variables
    exec(command, { 
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
      env: {
        ...process.env,
        LOG_LEVEL: 'debug',
        NODE_ENV: process.env.NODE_ENV || 'development',
        FORCE_COLOR: 'true' // Enable colored output
      }
    }, (error: ExecException | null, stdout: string, stderr: string) => {
      // Always show output regardless of error
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
 * Displays the main menu and handles user selection
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

    await executeTest(testChoice);
    
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
