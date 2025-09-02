export interface Caption {
  id?: string;
  username: string;
  topExtendedCaption?: string;
  bottomExtendedCaption?: string;
  topCaption?: string;
  bottomCaption?: string;
  topExtensionWhite?: boolean;
  bottomExtensionWhite?: boolean;
  createdAt: number;
}

export interface CaptionWithUpvotes extends Caption {
  upvotes: number;
  userUpvoted: boolean;
}