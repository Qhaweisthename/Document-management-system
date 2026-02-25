const vision = require('@google-cloud/vision');

async function testVision() {
  try {
    console.log('🔍 Testing Google Cloud Vision connection...');
    
    // Initialize the client
    const client = new vision.ImageAnnotatorClient({
      keyFilename: './gcp-credentials.json'
    });

    // Simple test - just get the project ID
    console.log('✅ Vision client created successfully!');
    console.log('📁 Credentials file loaded successfully');
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { success: false, error };
  }
}

testVision();