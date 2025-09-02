import { RedisClient } from '@devvit/redis';
import { Post } from '../../shared/types/post.type';

export class PostsServices {
  /**
   * Creates a new post in Redis using hSet
   */
  static async createPost(redis: RedisClient, post: Post): Promise<void> {
    try {
      const postKey = `post:${post.id}`;

      // Convert post object to Redis hash format
      const postData: Record<string, string> = {
        id: post.id,
        imageUrl: post.imageUrl,
      };

      // Add jobId if it exists
      if (post.jobId) {
        postData.jobId = post.jobId;
      }

      await redis.hSet(postKey, postData);
    } catch (error) {
      console.error(`Error creating post ${post.id}:`, error);
      throw new Error(
        `Failed to create post: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Retrieves a post from Redis using hGetAll (for server calls with RedisClient)
   */
  static async getPost(redis: RedisClient, postId: string): Promise<Post | null> {
    try {
      const postKey = `post:${postId}`;
      const postData = await redis.hGetAll(postKey);

      // Check if post exists
      if (!postData || Object.keys(postData).length === 0) {
        return null;
      }

      // Reconstruct Post object
      return {
        id: postData.id!,
        imageUrl: postData.imageUrl!,
        jobId: postData.jobId,
      };
    } catch (error) {
      console.error(`Error getting post ${postId}:`, error);
      throw new Error(
        `Failed to get post: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Purges a post from Redis and returns status and jobId (for Devvit component calls)
   */
  static async purgePost(
    redis: RedisClient,
    postId: string
  ): Promise<{ status: boolean; jobId?: string }> {
    try {
      // First get the post to retrieve jobId if it exists
      const post = await this.getPost(redis, postId);

      if (!post) {
        return { status: false };
      }

      const postKey = `post:${postId}`;
      await redis.del(postKey);

      return {
        status: true,
        jobId: post.jobId,
      };
    } catch (error) {
      console.error(`Error purging post ${postId} from Devvit:`, error);
      return { status: false };
    }
  }
}
