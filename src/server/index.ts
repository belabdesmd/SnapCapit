import express from 'express';
import {
  redis,
  reddit,
  createServer,
  context,
  getServerPort,
} from '@devvit/web/server';
import { scheduler } from '@devvit/web/server';
import { UiResponse } from '@devvit/web/shared';
import { PostsServices } from './core/posts.services';
import { CaptionsServices } from './core/captions.services';
import { Response } from 'express';

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({extended: true}));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

// --------------------------------------------------------

// Menu: Create Post Form Init from Menu Click
router.post('/internal/menu/create-post/:location', async (req, res: Response<UiResponse>) => {
  const {location} = req.params;
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
      data: {location: location},
    },
  });
});

// Form: Create Post Form
router.post('/internal/form/create-post', async (req, res: Response<UiResponse>) => {
  try {
    const {image, hours, location} = req.body;

    if (!image || !hours) {
      res.json({showToast: 'Please fill in all required fields'});
      return;
    }

    let jobId: string | undefined;

    // Create scheduled job if scheduler is available
    try {
      const hoursInMs = Number(hours) * 60 * 60 * 1000;
      const runAt = new Date(Date.now() + hoursInMs);
      jobId = await scheduler.runJob({
        name: 'post-best-captions',
        data: {
          imageUrl: image,
        },
        runAt,
      });
    } catch (error) {
      console.error('Error creating scheduled job:', error);
      res.json({showToast: 'Warning: Could not schedule automatic caption posting'});
    }

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
      title,
      subredditName: subreddit.name
    });

    // Create post in services using Context redis
    try {
      await PostsServices.createPost(redis, {id: post.id, imageUrl: image, jobId: jobId});
    } catch (error) {
      console.error('Error saving post to Redis:', error);
      // Clean up the Reddit post if we can't save to Redis
      try {
        await post.remove();
      } catch (removeError) {
        console.error('Error removing post after Redis failure:', removeError);
      }

      res.json({showToast: 'Error creating post. Please try again.'});
      return;
    }

    res.json({navigateTo: post.url});
  } catch (error) {
    console.error('Error creating caption post:', error);
    res.json({showToast: `Error creating post: ${error instanceof Error ? error.message : 'Unknown error'}`});
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

    res.json({status: 'success', username: username});
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
    const {postId} = context;

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
    const {captionId} = req.params;
    const {postId} = context;
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
    const {postId} = context;
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
    const {postId} = context;

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
