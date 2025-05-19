onst axios = require('axios');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Configuration from environment variables
const websiteUrl = process.env.WEBSITE_URL;
const expectedStatus = parseInt(process.env.EXPECTED_STATUS || '200');
const maxResponseTime = parseInt(process.env.MAX_RESPONSE_TIME || '5000');
const notificationEmail = process.env.NOTIFICATION_EMAIL;
const emailUser = process.env.EMAIL_USER;
const emailPassword = process.env.EMAIL_PASSWORD;
const emailService = process.env.EMAIL_SERVICE || 'gmail';

// GitHub Actions environment file path
const GITHUB_ENV = process.env.GITHUB_ENV;

// Function to set environment variables for GitHub Actions
function setGitHubActionOutput(name, value) {
  if (GITHUB_ENV) {
    // Append to the GitHub environment file
    fs.appendFileSync(GITHUB_ENV, `${name}=${value}\n`);
    console.log(`Set environment variable: ${name}=${value}`);
  } else {
    console.log(`GitHub environment file not available, can't set ${name}=${value}`);
  }
}

// Function to send notification email
async function sendNotification(subject, message) {
  if (!notificationEmail || !emailUser || !emailPassword) {
    console.log('Email notification skipped - missing configuration');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: emailService,
    auth: {
      user: emailUser,
      pass: emailPassword
    }
  });

  await transporter.sendMail({
    from: emailUser,
    to: notificationEmail,
    subject: subject,
    text: message,
    html: message.replace(/\n/g, '<br>')
  });
  
  console.log('Notification email sent');
}

// Main monitoring function
async function checkWebsite() {
  console.log(`Checking website: ${websiteUrl}`);
  
  try {
    const startTime = Date.now();
    const response = await axios.get(websiteUrl, {
      timeout: maxResponseTime,
      validateStatus: status => true // Don't throw on any status code
    });
    const responseTime = Date.now() - startTime;
    
    // Set environment variables for GitHub Actions
    setGitHubActionOutput('WEBSITE_STATUS', response.status.toString());
    setGitHubActionOutput('RESPONSE_TIME', responseTime.toString());
    
    console.log(`Status: ${response.status}, Response time: ${responseTime}ms`);
    
    // Check if website is down
    if (response.status !== expectedStatus) {
      console.log('❌ Website returned unexpected status code');
      await sendNotification(
        `🔴 Website DOWN: ${websiteUrl}`,
        `The website returned status code ${response.status} instead of the expected ${expectedStatus}.\n\nTimestamp: ${new Date().toISOString()}\nResponse time: ${responseTime}ms`
      );
      process.exit(1);
    }
    
    // Check if response time is too slow
    if (responseTime > maxResponseTime) {
      console.log('⚠️ Website response time exceeds threshold');
      await sendNotification(
        `⚠️ Website SLOW: ${websiteUrl}`,
        `The website response time (${responseTime}ms) exceeds the maximum threshold of ${maxResponseTime}ms.\n\nTimestamp: ${new Date().toISOString()}`
      );
    } else {
      console.log('✅ Website is up and responding within acceptable time');
    }
    
    // Write status to a file that can be used by other steps
    fs.writeFileSync('status.json', JSON.stringify({
      status: response.status,
      responseTime: responseTime,
      timestamp: new Date().toISOString()
    }));
    
  } catch (error) {
    console.error('❌ Error checking website:', error.message);
    
    // Set environment variables for GitHub Actions
    setGitHubActionOutput('WEBSITE_STATUS', 'ERROR');
    setGitHubActionOutput('RESPONSE_TIME', '0');
    
    await sendNotification(
      `🔴 Website DOWN: ${websiteUrl}`,
      `Failed to reach the website.\n\nError: ${error.message}\nTimestamp: ${new Date().toISOString()}`
    );
    
    // Write error status to a file
    fs.writeFileSync('status.json', JSON.stringify({
      status: 'ERROR',
      responseTime: 0,
      error: error.message,
      timestamp: new Date().toISOString()
    }));
    
    process.exit(1);
  }
}

// Run the check
checkWebsite().catch(console.error);
