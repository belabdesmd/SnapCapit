import express from 'express';
import { redis, createServer, context, getServerPort, scheduler, settings } from '@devvit/web/server';
import { reddit } from '@devvit/reddit';
import { media } from '@devvit/media';
import { UiResponse } from '@devvit/web/shared';
import { PostsServices } from './core/posts.services';
import { CaptionsServices } from './core/captions.services';
import { Response } from 'express';

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

// --------------------------------------------------------

// Menu: Create Post Form Init from Menu Click
router.post('/internal/menu/create-post/:location', async (req, res: Response<UiResponse>) => {
  const { location } = req.params;
  res.json({
    showForm: {
      name: 'createPostForm',
      form: {
        title: 'Create Caption Contest',
        description: 'Upload the image you want subscribers to caption',
        fields: [
          {
            name: 'image',
            label: 'Upload Image',
            type: 'image',
            required: true,
          },
          {
            name: 'hours',
            label: 'Hours',
            helpText: 'How many hours to keep the post alive for',
            type: 'number',
            required: true,
            defaultValue: 24,
          },
        ],
      },
      data: { location: location },
    },
  });
});

// Form: Create Post Form
router.post('/internal/form/create-post', async (req, res: Response<UiResponse>) => {
  try {
    const { image, hours, location } = req.body;

    if (!image || !hours) {
      res.json({ showToast: 'Please fill in all required fields' });
      return;
    }

    let jobId: string | undefined;

    // Get current user for username in title
    let username: string | undefined;
    try {
      username = await reddit.getCurrentUsername();
    } catch (error) {
      console.error('Error getting current user:', error);
    }

    // Create post title
    let title = 'Caption this Image';
    if (location === 'post' && username) {
      title += ` - Added by u/${username}`;
    }

    // Submit post to Reddit
    const subreddit = await reddit.getCurrentSubreddit();
    const post = await reddit.submitCustomPost({
      title: title,
      subredditName: subreddit.name,
      splash: {
        backgroundUri: image,
        appIconUri: "logo.png",
        heading: "The Image is Yours — Caption It"
      }
    });

    // Create scheduled job if scheduler is available
    try {
      //TODO: const hoursInMs = Number(hours) * 60 * 60 * 1000;
      const hoursInMs = 3 * 60 * 1000;
      const runAt = new Date(Date.now() + hoursInMs);
      jobId = await scheduler.runJob({
        name: 'post-best-captions',
        data: { imageUrl: image, postId: post.id },
        runAt,
      });
    } catch (error) {
      console.error('Error creating scheduled job:', error);
      res.json({ showToast: 'Warning: Could not schedule automatic caption posting' });
    }

    // Create post in services using Context redis
    try {
      await PostsServices.createPost(redis, { id: post.id, imageUrl: image, jobId: jobId });
    } catch (error) {
      console.error('Error saving post to Redis:', error);
      // Clean up the Reddit post if we can't save to Redis
      try {
        await post.remove();
      } catch (removeError) {
        console.error('Error removing post after Redis failure:', removeError);
      }

      res.json({ showToast: 'Error creating post. Please try again.' });
      return;
    }

    res.json({ navigateTo: post.url });
  } catch (error) {
    console.error('Error creating caption post:', error);
    res.json({
      showToast: `Error creating post: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
});

// Job: Post Best Captions
router.post('/internal/job/post-best-captions', async (req, _res) => {
  try {
    const { imageUrl, postId } = req.body.data;

    if (!postId) {
      console.error('No postId available in job context');
      return;
    }

    // Get post and best captions using Context redis
    let post;
    try {
      post = await PostsServices.getPost(redis, postId);
      if (!post) {
        console.error(`Post ${postId} not found`);
        return;
      }
    } catch (error) {
      console.error(`Error getting post ${postId}:`, error);
      return;
    }

    let bestCaptions;
    try {
      bestCaptions = await CaptionsServices.getTopCaptions(redis, postId);
    } catch (error) {
      console.error(`Error getting top captions for post ${postId}:`, error);
      return;
    }

    // Get API key from settings
    let apiKey;
    try {
      apiKey = await settings.get('API_KEY');
      if (!apiKey) {
        console.error('API_KEY not found in settings');
        return;
      }
    } catch (error) {
      console.error('Error getting API key from settings:', error);
      return;
    }

    // Remove original post
    try {
      const originalPost = await reddit.getPostById(postId);
      if (originalPost) await originalPost.remove();
    } catch (error) {
      console.error(`Error removing original post ${postId}:`, error);
    }

    // Process each caption
    for (const caption of bestCaptions) {
      try {
        // Build caption data (excluding username, id, createdAt)
        const captionData = {
          imageUrl,
          caption: {
            topCaption: caption.topCaption,
            bottomCaption: caption.bottomCaption,
            topExtendedCaption: caption.topExtendedCaption,
            bottomExtendedCaption: caption.bottomExtendedCaption,
            topExtensionWhite: caption.topExtensionWhite,
            bottomExtensionWhite: caption.bottomExtensionWhite,
          },
        };

        // Make API call to generate caption image
        const response = await fetch('https://snapcap.belfodil.me/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey as string,
          },
          body: JSON.stringify(captionData),
        });

        if (!response.ok) {
          console.error(
            `API call failed for caption ${caption.id}: ${response.status} ${response.statusText}`
          );
          continue;
        }

        // Get base64 image data
        const base64ImageData = await response.text();

        // Upload image to Reddit
        const mediaAsset = await media.upload({
          url: base64ImageData,
          type: 'image',
        });
        // pause to make sure the image is properly uploaded
        await new Promise(r => setTimeout(r, 3000));

        // Submit new post with generated caption image
        const subreddit = await reddit.getCurrentSubreddit();
        await reddit.submitPost({
          kind: 'image',
          title: `Caption created by u/${caption.username}`,
          subredditName: subreddit.name,
          imageUrls: [mediaAsset.mediaUrl]
        });

        console.log(`Successfully posted caption by ${caption.username}`);
      } catch (error) {
        console.error(`Error processing caption ${caption.id}:`, error);
      }
    }

    // Purge post and captions using Context redis
    try {
      await PostsServices.purgePost(redis, postId);
      await CaptionsServices.purgeCaptionsAndUpvotes(redis, postId);
      console.log(`Successfully cleaned up data for post ${postId}`);
    } catch (error) {
      console.error(`Error cleaning up data for post ${postId}:`, error);
    }

    console.log(`Successfully processed best captions for post ${postId}`);
  } catch (error) {
    console.error('Error in postBestCaptions job:', error);
  }
});

// Trigger: On Post Delete
router.post('/internal/trigger/post-delete', async (req, _res) => {
  try {
    const postId = req.body.postId;
    if (!postId) {
      console.error('No post ID found in PostDelete event');
      return;
    }

    // Get post data to retrieve jobId using Context redis
    let postData;
    try {
      postData = await PostsServices.purgePost(redis, postId);
    } catch (error) {
      console.error(`Error purging post ${postId}:`, error);
      postData = { status: false };
    }

    // Cancel scheduled job if it exists
    if (scheduler && postData.jobId) {
      try {
        await scheduler.cancelJob(postData.jobId);
        console.log(`Cancelled job ${postData.jobId} for deleted post ${postId}`);
      } catch (error) {
        console.error(`Error cancelling job ${postData.jobId}:`, error);
      }
    }

    // Purge captions and upvotes using Context redis
    try {
      await CaptionsServices.purgeCaptionsAndUpvotes(redis, postId);
      console.log(`Successfully cleaned up captions for deleted post ${postId}`);
    } catch (error) {
      console.error(`Error cleaning up captions for post ${postId}:`, error);
    }

    console.log(`Successfully processed deletion of post ${postId}`);
  } catch (error) {
    console.error('Error in postDelete trigger:', error);
  }
});

// --------------------------------------------------------

// Get current user's username
router.get('/api/username', async (_req, res): Promise<void> => {
  try {
    const username = await reddit.getCurrentUsername();

    if (!username) {
      res.status(404).json({
        status: 'error',
        message: 'Username not found',
      });
      return;
    }

    res.json({ status: 'success', username: username });
  } catch (error) {
    console.error('Error getting username:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get username',
    });
  }
});

// Create a new caption
router.post('/api/captions/create', async (req, res): Promise<void> => {
  const caption = req.body;
  try {
    const { postId } = context;

    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'Post ID is required',
      });
      return;
    }

    const createdCaption = await CaptionsServices.createCaption(redis, postId, caption);

    res.json({
      status: 'success',
      caption: createdCaption,
    });
  } catch (error) {
    console.error('Error creating caption:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to create caption',
    });
  }
});

// Upvote a caption
router.post('/api/captions/:captionId/upvote', async (req, res): Promise<void> => {
  try {
    const { captionId } = req.params;
    const { postId } = context;
    const username = await reddit.getCurrentUsername();

    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'Post ID is required',
      });
      return;
    }

    if (!username) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
      return;
    }

    if (!captionId) {
      res.status(400).json({
        status: 'error',
        message: 'Caption ID is required',
      });
      return;
    }

    const userUpvoted = await CaptionsServices.upvoteCaption(redis, postId, captionId, username);

    res.json({
      status: 'success',
      userUpvoted,
    });
  } catch (error) {
    console.error('Error upvoting caption:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to upvote caption',
    });
  }
});

// Get all captions with upvote information
router.get('/api/captions', async (_req, res): Promise<void> => {
  try {
    const { postId } = context;
    const username = await reddit.getCurrentUsername();

    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'Post ID is required',
      });
      return;
    }

    if (!username) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
      return;
    }

    const captions = await CaptionsServices.getCaptionsWithUpvotes(redis, postId, username);

    res.json({
      status: 'success',
      captions,
    });
  } catch (error) {
    console.error('Error getting captions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get captions',
    });
  }
});

// Get post image URL
router.get('/api/post/image', async (_req, res): Promise<void> => {
  try {
    const { postId } = context;

    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'Post ID is required',
      });
      return;
    }

    const post = await PostsServices.getPost(redis, postId);

    if (!post) {
      res.status(404).json({
        status: 'error',
        message: 'Post not found',
      });
      return;
    }

    res.json({
      status: 'success',
      imageUrl: post.imageUrl,
    });
  } catch (error) {
    console.error('Error getting post image:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get post image',
    });
  }
});

// Use router middleware
app.use(router);

// Get port from environment variable with fallback
const port = getServerPort();

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port, () => console.log(`http://localhost:${port}`));
