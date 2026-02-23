"""
Test script for phoneme grouping functionality
Run this to verify the grouped viseme generation is working correctly
"""

from app.services.phoneme_service import text_to_grouped_viseme_sequence, text_to_phonemes

def test_phoneme_grouping():
    """Test the phoneme grouping with sample text"""
    
    test_texts = [
        "Hello world",
        "The quick brown fox",
        "Beautiful day",
        "Testing phoneme groups"
    ]
    
    print("=" * 80)
    print("PHONEME GROUPING TEST")
    print("=" * 80)
    
    for text in test_texts:
        print(f"\n📝 Text: '{text}'")
        print("-" * 80)
        
        # Get raw phonemes
        phonemes = text_to_phonemes(text)
        print(f"🗣️  Raw Phonemes: {phonemes}")
        
        # Get grouped visemes
        grouped = text_to_grouped_viseme_sequence(text)
        
        print(f"\n📊 Grouped Visemes ({len(grouped)} groups):")
        print("-" * 80)
        
        for i, group in enumerate(grouped, 1):
            duration = group['end'] - group['start']
            phoneme_list = ', '.join(group['phonemes'])
            print(f"{i}. {group['group']:15s} | {phoneme_list:20s} | "
                  f"{group['start']:.3f}s - {group['end']:.3f}s ({duration:.3f}s)")
        
        total_duration = grouped[-1]['end'] if grouped else 0
        print(f"\n⏱️  Total Duration: {total_duration:.3f}s")
        print("=" * 80)

if __name__ == "__main__":
    test_phoneme_grouping()
