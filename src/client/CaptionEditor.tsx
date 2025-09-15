import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from './icons';

interface Caption {
  id?: string;
  username: string;
  topExtensionWhite?: boolean;
  bottomExtensionWhite?: boolean;
  topExtendedCaption?: string;
  bottomExtendedCaption?: string;
  topCaption?: string;
  bottomCaption?: string;
  createdAt: number;
}

interface CaptionWithUpvotes extends Caption {
  upvotes: number;
  userUpvoted: boolean;
}

// Toggle for testing vs production
const USE_DUMMY_DATA = false;

// Dummy data for testing
const DUMMY_DATA = {
  username: 'testuser',
  imageUrl: 'https://images.pexels.com/photos/45201/kitty-cat-kitten-pet-45201.jpeg?auto=compress&cs=tinysrgb&w=700&h=400',
  captions: [
    {
      id: '1',
      username: 'otheruser',
      topCaption: 'WHEN YOU REALIZE',
      bottomCaption: 'IT\'S MONDAY AGAIN',
      upvotes: 15,
      userUpvoted: false,
      createdAt: Date.now() - 3600000,
    },
    {
      id: '2',
      username: 'anotheruser',
      topExtendedCaption: 'EXTENDED TOP CAPTION HERE',
      topCaption: 'MAIN TOP',
      bottomCaption: 'MAIN BOTTOM',
      bottomExtendedCaption: 'EXTENDED BOTTOM CAPTION',
      topExtensionWhite: true,
      bottomExtensionWhite: false,
      upvotes: 8,
      userUpvoted: true,
      createdAt: Date.now() - 7200000,
    },
  ] as CaptionWithUpvotes[],
};

// Responsive sizing constants
const BASE_FONT_SIZE_VW = (32 / 700) * 100;
const MIN_HEIGHT_1_LINE_VW = (42 / 700) * 100; // Increased for better spacing
const MIN_HEIGHT_2_LINES_VW = (74 / 700) * 100; // Increased for better spacing
const BANNER_PADDING_VW = (20 / 700) * 100; // Consistent padding

export const CaptionEditor: React.FC = () => {
  const [captions, setCaptions] = useState<CaptionWithUpvotes[]>([]);
  const [currentCaptionIndex, setCurrentCaptionIndex] = useState(0);
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [upvoting, setUpvoting] = useState(false);
  const [error, setError] = useState<string>('');

  // Editor state for create mode
  const [editorTopExtension, setEditorTopExtension] = useState(false);
  const [editorBottomExtension, setEditorBottomExtension] = useState(false);

  // Form state for new caption
  const [newCaption, setNewCaption] = useState({
    top: '',
    bottom: '',
    topExtended: '',
    bottomExtended: '',
    topExtensionWhite: false,
    bottomExtensionWhite: false,
  });

  // Refs for text measurement
  const topTextRef = useRef<HTMLTextAreaElement>(null);
  const bottomTextRef = useRef<HTMLTextAreaElement>(null);
  const topExtendedTextRef = useRef<HTMLTextAreaElement>(null);
  const bottomExtendedTextRef = useRef<HTMLTextAreaElement>(null);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError('');

        if (USE_DUMMY_DATA) {
          // Use dummy data
          setCurrentUsername(DUMMY_DATA.username);
          setImageUrl(DUMMY_DATA.imageUrl);

          // Add create mode caption if user doesn't have one
          const userCaptions = DUMMY_DATA.captions.filter(c => c.username === DUMMY_DATA.username);
          const otherCaptions = DUMMY_DATA.captions.filter(c => c.username !== DUMMY_DATA.username);

          if (userCaptions.length === 0) {
            setCaptions([
              {
                id: undefined,
                username: DUMMY_DATA.username,
                createdAt: Date.now(),
                upvotes: 1,
                userUpvoted: false,
              },
              ...otherCaptions,
            ]);
          } else {
            setCaptions([...userCaptions, ...otherCaptions]);
          }
        } else {
          // Load from server
          const [usernameResponse, imageResponse, captionsResponse] = await Promise.all([
            fetch('/api/username'),
            fetch('/api/post/image'),
            fetch('/api/captions'),
          ]);

          if (!usernameResponse.ok || !imageResponse.ok || !captionsResponse.ok) {
            throw new Error('Failed to load data');
          }

          const usernameData = await usernameResponse.json();
          const imageData = await imageResponse.json();
          const captionsData = await captionsResponse.json();

          setCurrentUsername(usernameData.username);
          setImageUrl(imageData.imageUrl);

          const userCaptions = captionsData.captions.filter(
            (c: CaptionWithUpvotes) => c.username === usernameData.username
          );
          const otherCaptions = captionsData.captions.filter(
            (c: CaptionWithUpvotes) => c.username !== usernameData.username
          );

          if (userCaptions.length === 0) {
            setCaptions([
              {
                id: undefined,
                username: usernameData.username,
                createdAt: Date.now(),
                upvotes: 1,
                userUpvoted: false,
              },
              ...otherCaptions,
            ]);
          } else {
            setCaptions([...userCaptions, ...otherCaptions]);
          }
        }
      } catch (err) {
        console.error('Error loading initial data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  const currentCaption = captions[currentCaptionIndex];
  const isCreatingMode = currentCaption?.id === undefined;
  const isUserCaption = currentCaption?.username === currentUsername;

  const getShowTopExtension = () => {
    if (isCreatingMode) return editorTopExtension;
    return !!currentCaption?.topExtendedCaption;
  };

  const getShowBottomExtension = () => {
    if (isCreatingMode) return editorBottomExtension;
    return !!currentCaption?.bottomExtendedCaption;
  };

  const checkTextOverflow = (textArea: HTMLTextAreaElement): { hit2Lines?: boolean; overflown: boolean } => {
    if (!textArea) return { overflown: false };
    textArea.style.height = "auto";

    const computedStyle = getComputedStyle(textArea);
    const lineHeight = parseFloat(computedStyle.lineHeight);
    const fontSize = parseFloat(computedStyle.fontSize);
    const actualLineHeight = isNaN(lineHeight) ? fontSize * 1.2 : lineHeight;
    const maxHeight = actualLineHeight * 3;

    const currentHeight = textArea.scrollHeight;

    return {
      hit2Lines: currentHeight > Math.round(actualLineHeight * 2),
      overflown: currentHeight > maxHeight,
    };
  };

  const handleInputChange = (
    field: string,
    value: string,
    textAreaRef: React.RefObject<HTMLTextAreaElement | null>
  ) => {
    if (!isCreatingMode) return;

    const upperValue = value.toUpperCase();

    if (textAreaRef.current) {
      const originalValue = textAreaRef.current.value;
      textAreaRef.current.value = upperValue;

      const lineStatus = checkTextOverflow(textAreaRef.current);
      textAreaRef.current.style.height = lineStatus.hit2Lines
        ? `${MIN_HEIGHT_2_LINES_VW}vw`
        : `${MIN_HEIGHT_1_LINE_VW}vw`;

      if (lineStatus.overflown) {
        textAreaRef.current.value = originalValue;
        const prevLineStatus = checkTextOverflow(textAreaRef.current);
        textAreaRef.current.style.height = prevLineStatus.hit2Lines
          ? `${MIN_HEIGHT_2_LINES_VW}vw`
          : `${MIN_HEIGHT_1_LINE_VW}vw`;
        return;
      }

      textAreaRef.current.value = originalValue;
    }

    setNewCaption((prev) => ({ ...prev, [field]: upperValue }));
  };

  const handleExtensionToggle = (position: 'top' | 'bottom') => {
    if (!isCreatingMode) return;

    if (position === 'top') {
      setEditorTopExtension(!editorTopExtension);
    } else {
      setEditorBottomExtension(!editorBottomExtension);
    }
  };

  const handleColorToggle = (position: 'top' | 'bottom', isWhite: boolean) => {
    if (!isCreatingMode) return;

    const field = position === 'top' ? 'topExtensionWhite' : 'bottomExtensionWhite';
    setNewCaption((prev) => ({ ...prev, [field]: isWhite }));
  };

  const handleUpvote = async () => {
    if (isCreatingMode || isUserCaption || upvoting) return;

    try {
      setUpvoting(true);

      if (USE_DUMMY_DATA) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Toggle upvote in dummy data
        setCaptions((prev) =>
          prev.map((caption) =>
            caption.id === currentCaption!.id
              ? {
                  ...caption,
                  upvotes: caption.userUpvoted ? caption.upvotes - 1 : caption.upvotes + 1,
                  userUpvoted: !caption.userUpvoted,
                }
              : caption
          )
        );
      } else {
        // Real API call
        const response = await fetch(`/api/captions/${currentCaption!.id}/upvote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to upvote');
        }

        const { userUpvoted } = await response.json();

        setCaptions((prev) =>
          prev.map((caption) =>
            caption.id === currentCaption!.id
              ? {
                  ...caption,
                  upvotes: userUpvoted ? caption.upvotes + 1 : caption.upvotes - 1,
                  userUpvoted,
                }
              : caption
          )
        );
      }
    } catch (err) {
      console.error('Error upvoting caption:', err);
      setError(err instanceof Error ? err.message : 'Failed to upvote');
    } finally {
      setUpvoting(false);
    }
  };

  const handleCreateCaption = async () => {
    const hasContent = newCaption.top || newCaption.bottom || newCaption.topExtended || newCaption.bottomExtended;
    if (!hasContent) {
      setError('At least one caption field must be filled');
      return;
    }

    try {
      setCreating(true);

      if (USE_DUMMY_DATA) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Create dummy caption
        const createdCaption: CaptionWithUpvotes = {
          id: Date.now().toString(),
          username: currentUsername,
          topCaption: newCaption.top || undefined,
          bottomCaption: newCaption.bottom || undefined,
          topExtendedCaption: newCaption.topExtended || undefined,
          bottomExtendedCaption: newCaption.bottomExtended || undefined,
          topExtensionWhite: newCaption.topExtensionWhite,
          bottomExtensionWhite: newCaption.bottomExtensionWhite,
          createdAt: Date.now(),
          upvotes: 1,
          userUpvoted: true,
        };

        setCaptions((prev) => {
          const newCaptions = [...prev];
          newCaptions[0] = createdCaption;
          return newCaptions;
        });
      } else {
        // Real API call
        const captionToCreate: Caption = {
          username: currentUsername,
          topCaption: newCaption.top || undefined,
          bottomCaption: newCaption.bottom || undefined,
          topExtendedCaption: newCaption.topExtended || undefined,
          bottomExtendedCaption: newCaption.bottomExtended || undefined,
          topExtensionWhite: newCaption.topExtensionWhite,
          bottomExtensionWhite: newCaption.bottomExtensionWhite,
          createdAt: Date.now(),
        };

        const response = await fetch('/api/captions/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(captionToCreate),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to create caption');
        }

        const createdCaption = (await response.json()).caption;
        const captionWithUpvotes: CaptionWithUpvotes = {
          ...createdCaption,
          upvotes: 1,
          userUpvoted: true,
        };

        setCaptions((prev) => {
          const newCaptions = [...prev];
          newCaptions[0] = captionWithUpvotes;
          return newCaptions;
        });
      }

      // Reset form
      setNewCaption({
        top: '',
        bottom: '',
        topExtended: '',
        bottomExtended: '',
        topExtensionWhite: false,
        bottomExtensionWhite: false,
      });
      setEditorTopExtension(false);
      setEditorBottomExtension(false);
      setError('');
    } catch (err) {
      console.error('Error creating caption:', err);
      setError(err instanceof Error ? err.message : 'Failed to create caption');
    } finally {
      setCreating(false);
    }
  };

  const getInputValue = (field: string) => {
    if (isCreatingMode) {
      return newCaption[field as keyof typeof newCaption] as string;
    }

    switch (field) {
      case 'top': return currentCaption?.topCaption || '';
      case 'bottom': return currentCaption?.bottomCaption || '';
      case 'topExtended': return currentCaption?.topExtendedCaption || '';
      case 'bottomExtended': return currentCaption?.bottomExtendedCaption || '';
      default: return '';
    }
  };

  const getTextStyle = () => ({
    fontSize: `${BASE_FONT_SIZE_VW}vw`,
    lineHeight: '1.2',
    fontWeight: 'bold',
    textTransform: 'uppercase' as const,
  });

  const calculateBannerHeight = (text: string) => {
    if (!text) return `${MIN_HEIGHT_1_LINE_VW + BANNER_PADDING_VW}vw`;
    
    // Estimate lines based on text length and viewport width
    const estimatedCharsPerLine = Math.floor(window.innerWidth / (((BASE_FONT_SIZE_VW * window.innerWidth) / 100) * 0.6));
    const estimatedLines = Math.ceil(text.length / estimatedCharsPerLine);
    const lines = Math.min(estimatedLines, 2); // Max 2 lines
    
    if (lines > 1) {
      return `${MIN_HEIGHT_2_LINES_VW + BANNER_PADDING_VW}vw`;
    }
    return `${MIN_HEIGHT_1_LINE_VW + BANNER_PADDING_VW}vw`;
  };

  const getExtensionBgColor = (position: 'top' | 'bottom') => {
    const isWhite = position === 'top'
      ? (isCreatingMode ? newCaption.topExtensionWhite : currentCaption?.topExtensionWhite)
      : (isCreatingMode ? newCaption.bottomExtensionWhite : currentCaption?.bottomExtensionWhite);
    return isWhite ? 'bg-white' : 'bg-black';
  };

  const getExtensionTextColor = (position: 'top' | 'bottom') => {
    const isWhite = position === 'top'
      ? (isCreatingMode ? newCaption.topExtensionWhite : currentCaption?.topExtensionWhite)
      : (isCreatingMode ? newCaption.bottomExtensionWhite : currentCaption?.bottomExtensionWhite);
    return isWhite ? 'text-black placeholder-black/50' : 'text-white placeholder-white/50';
  };

  if (loading) {
    return (
      <div className="h-screen bg-[#0B1416] text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  const showTopExtension = getShowTopExtension();
  const showBottomExtension = getShowBottomExtension();

  return (
    <div className="h-screen bg-[#0B1416] text-white flex flex-col">
      <div className="flex-1 flex flex-col">
        {/* Top Extension - Create Mode */}
        {isCreatingMode && (
          <div className="relative">
            <div
              className="h-4 sm:h-6 bg-[#343536] flex items-center justify-center cursor-pointer"
              onClick={() => handleExtensionToggle('top')}
            >
              {showTopExtension ? (
                <ChevronDownIcon className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
              ) : (
                <ChevronUpIcon className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
              )}
            </div>

            {showTopExtension && (
              <div 
                className={`${getExtensionBgColor('top')} relative flex items-center justify-center`}
                style={{ height: calculateBannerHeight(getInputValue('topExtended')) }}
              >
                <div className="absolute top-1/2 right-1 sm:right-2 transform -translate-y-1/2 flex flex-col space-y-1 sm:space-y-2 z-10">
                  <button
                    className={`w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-black border-2 ${
                      !newCaption.topExtensionWhite ? 'border-[#FF4500]' : 'border-white'
                    } hover:border-[#FF4500] transition-colors`}
                    onClick={() => handleColorToggle('top', false)}
                  />
                  <button
                    className={`w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-white border-2 ${
                      newCaption.topExtensionWhite ? 'border-[#FF4500]' : 'border-gray-400'
                    } hover:border-[#FF4500] transition-colors`}
                    onClick={() => handleColorToggle('top', true)}
                  />
                </div>
                <textarea
                  ref={topExtendedTextRef}
                  className={`w-full bg-transparent border-none outline-none resize-none m-0 text-center ${getExtensionTextColor('top')} overflow-hidden flex items-center justify-center`}
                  placeholder="EXTENDED TOP CAPTION..."
                  value={getInputValue('topExtended')}
                  onChange={(e) => handleInputChange('topExtended', e.target.value, topExtendedTextRef)}
                  disabled={!isCreatingMode}
                  style={{
                    ...getTextStyle(),
                    height: `${MIN_HEIGHT_1_LINE_VW}vw`,
                    minHeight: `${MIN_HEIGHT_1_LINE_VW}vw`,
                    padding: `${BANNER_PADDING_VW / 2}vw 2vw`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Top Extension - View Mode */}
        {!isCreatingMode && showTopExtension && (
          <div 
            className={`${getExtensionBgColor('top')} flex items-center justify-center`}
            style={{ height: calculateBannerHeight(getInputValue('topExtended')) }}
          >
            <div
              className={`w-full text-center ${getExtensionTextColor('top')} flex items-center justify-center`}
              style={{
                ...getTextStyle(),
                padding: `${BANNER_PADDING_VW / 2}vw 2vw`,
              }}
            >
              {getInputValue('topExtended').toUpperCase()}
            </div>
          </div>
        )}

        {/* Image with Overlays */}
        <div className="relative flex-1">
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Caption this"
              className="w-full h-full object-cover"
              style={{ aspectRatio: '16/9' }}
            />
          )}

          {/* Top Caption Overlay */}
          {(isCreatingMode || getInputValue('top')) && (
            <div className="absolute top-2 sm:top-4 left-0 right-0">
              <div className="mx-2 sm:mx-4">
                <textarea
                  ref={topTextRef}
                  className="w-full bg-transparent border-none outline-none m-0 p-0 text-white placeholder-white/50 resize-none text-center overflow-hidden"
                  placeholder="TOP CAPTION..."
                  value={getInputValue('top')}
                  onChange={(e) => handleInputChange('top', e.target.value, topTextRef)}
                  disabled={!isCreatingMode}
                  style={{
                    ...getTextStyle(),
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    height: `${MIN_HEIGHT_1_LINE_VW}vw`,
                    minHeight: isCreatingMode ? `${MIN_HEIGHT_1_LINE_VW}vw` : 'auto',
                  }}
                />
              </div>
            </div>
          )}

          {/* Bottom Caption Overlay */}
          {(isCreatingMode || getInputValue('bottom')) && (
            <div className="absolute bottom-2 sm:bottom-4 left-0 right-0">
              <div className="mx-2 sm:mx-4">
                <textarea
                  ref={bottomTextRef}
                  className="w-full bg-transparent border-none outline-none m-0 p-0 text-white placeholder-white/50 resize-none text-center overflow-hidden"
                  placeholder="BOTTOM CAPTION..."
                  value={getInputValue('bottom')}
                  onChange={(e) => handleInputChange('bottom', e.target.value, bottomTextRef)}
                  disabled={!isCreatingMode}
                  style={{
                    ...getTextStyle(),
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    height: `${MIN_HEIGHT_1_LINE_VW}vw`,
                    minHeight: isCreatingMode ? `${MIN_HEIGHT_1_LINE_VW}vw` : 'auto',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Bottom Extension - View Mode */}
        {!isCreatingMode && showBottomExtension && (
          <div 
            className={`${getExtensionBgColor('bottom')} flex items-center justify-center`}
            style={{ height: calculateBannerHeight(getInputValue('bottomExtended')) }}
          >
            <div
              className={`w-full text-center ${getExtensionTextColor('bottom')} flex items-center justify-center`}
              style={{
                ...getTextStyle(),
                padding: `${BANNER_PADDING_VW / 2}vw 2vw`,
              }}
            >
              {getInputValue('bottomExtended').toUpperCase()}
            </div>
          </div>
        )}

        {/* Bottom Extension - Create Mode */}
        {isCreatingMode && (
          <div className="relative">
            {showBottomExtension && (
              <div 
                className={`${getExtensionBgColor('bottom')} relative flex items-center justify-center`}
                style={{ height: calculateBannerHeight(getInputValue('bottomExtended')) }}
              >
                <div className="absolute top-1/2 right-1 sm:right-2 transform -translate-y-1/2 flex flex-col space-y-1 sm:space-y-2 z-10">
                  <button
                    className={`w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-black border-2 ${
                      !newCaption.bottomExtensionWhite ? 'border-[#FF4500]' : 'border-white'
                    } hover:border-[#FF4500] transition-colors`}
                    onClick={() => handleColorToggle('bottom', false)}
                  />
                  <button
                    className={`w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-white border-2 ${
                      newCaption.bottomExtensionWhite ? 'border-[#FF4500]' : 'border-gray-400'
                    } hover:border-[#FF4500] transition-colors`}
                    onClick={() => handleColorToggle('bottom', true)}
                  />
                </div>
                <textarea
                  ref={bottomExtendedTextRef}
                  className={`w-full bg-transparent border-none outline-none resize-none m-0 text-center ${getExtensionTextColor('bottom')} overflow-hidden flex items-center justify-center`}
                  placeholder="EXTENDED BOTTOM CAPTION..."
                  value={getInputValue('bottomExtended')}
                  onChange={(e) => handleInputChange('bottomExtended', e.target.value, bottomExtendedTextRef)}
                  disabled={!isCreatingMode}
                  style={{
                    ...getTextStyle(),
                    height: `${MIN_HEIGHT_1_LINE_VW}vw`,
                    minHeight: `${MIN_HEIGHT_1_LINE_VW}vw`,
                    padding: `${BANNER_PADDING_VW / 2}vw 2vw`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                />
              </div>
            )}
            <div
              className="h-4 sm:h-6 bg-[#343536] flex items-center justify-center cursor-pointer"
              onClick={() => handleExtensionToggle('bottom')}
            >
              {showBottomExtension ? (
                <ChevronUpIcon className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
              ) : (
                <ChevronDownIcon className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Toolbar - Responsive */}
      <div className="h-16 sm:h-20 bg-[#1A1A1B] border-t border-[#343536] flex items-center justify-between px-2 sm:px-4 lg:px-8">
        {/* Left - Username with BoltBadge */}
        <div className="flex items-center flex-shrink-0 min-w-0">
          <div className="text-[#D7DADC] font-bold text-sm sm:text-lg lg:text-xl truncate">
            u/{currentCaption?.username || currentUsername}
          </div>
        </div>

        {/* Center - Navigation */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          <button
            className="p-2 sm:p-3 bg-[#272729] hover:bg-[#343536] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-[#343536]"
            onClick={() => setCurrentCaptionIndex(Math.max(0, currentCaptionIndex - 1))}
            disabled={currentCaptionIndex === 0}
          >
            <ChevronLeftIcon className="w-3 h-3 sm:w-5 sm:h-5" />
          </button>
          <span className="text-xs sm:text-sm text-[#818384] px-1 sm:px-3 font-medium whitespace-nowrap">
            {currentCaptionIndex + 1} / {captions.length}
          </span>
          <button
            className="p-2 sm:p-3 bg-[#272729] hover:bg-[#343536] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-[#343536]"
            onClick={() => setCurrentCaptionIndex(Math.min(captions.length - 1, currentCaptionIndex + 1))}
            disabled={currentCaptionIndex === captions.length - 1}
          >
            <ChevronRightIcon className="w-3 h-3 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Right - Action Button */}
        <div className="flex-shrink-0">
          {isCreatingMode ? (
            <button
              className="bg-[#FF4500] hover:bg-[#FF5722] disabled:bg-[#FF4500]/50 disabled:cursor-not-allowed text-white px-3 py-2 sm:px-6 sm:py-3 lg:px-8 rounded-full font-medium transition-colors shadow-lg text-xs sm:text-sm lg:text-base flex items-center space-x-2"
              onClick={handleCreateCaption}
              disabled={creating}
            >
              {creating && (
                <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              <span>{creating ? 'Creating...' : 'Add Caption'}</span>
            </button>
          ) : (
            <div className="flex items-center space-x-2 sm:space-x-3">
              <button
                className={`p-2 sm:p-3 rounded-full transition-colors border flex items-center justify-center ${
                  isUserCaption
                    ? 'bg-[#272729] border-[#343536] cursor-not-allowed opacity-50'
                    : currentCaption?.userUpvoted
                    ? 'bg-[#FF4500] border-[#FF4500] cursor-pointer'
                    : 'bg-[#272729] hover:bg-[#FF4500] border-[#343536] hover:border-[#FF4500] cursor-pointer'
                } ${upvoting ? 'cursor-not-allowed' : ''}`}
                onClick={handleUpvote}
                disabled={isUserCaption || upvoting}
              >
                {upvoting ? (
                  <div className="w-3 h-3 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : currentCaption?.userUpvoted ? (
                  <ArrowDownIcon className="w-3 h-3 sm:w-5 sm:h-5 text-white" />
                ) : (
                  <ArrowUpIcon className="w-3 h-3 sm:w-5 sm:h-5 text-white" />
                )}
              </button>
              <div className="text-[#D7DADC] font-bold text-xs sm:text-sm lg:text-xl whitespace-nowrap">
                {currentCaption?.upvotes || 0} upvotes
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-600 text-white px-4 py-2 text-center text-sm sm:text-base">
          {error}
          <button className="ml-4 underline" onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};
