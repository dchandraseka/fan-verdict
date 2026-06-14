# FanVerdict App Store Publishing Notes

Last updated: June 14, 2026

## Summary

FanVerdict is currently a Next.js web application. The lowest-risk path is to first make it a polished installable web app, then package the same experience for Android and iOS using a wrapper such as Capacitor.

Recommended order:

1. Make FanVerdict a polished PWA.
2. Package and test Android first.
3. Package and test iOS using a Mac.
4. Submit to Google Play and Apple App Store after privacy, account deletion, screenshots, and review materials are ready.

## Store Costs

Apple App Store:

- Apple Developer Program costs 99 USD per membership year.
- Prices can vary by region.
- Some nonprofits, accredited educational institutions, and government entities may qualify for a fee waiver.
- Official source: https://developer.apple.com/programs/enroll/

Google Play Store:

- Google Play Console developer registration costs 25 USD one time.
- Official source: https://support.google.com/googleplay/android-developer/answer/6112435

Google personal developer account testing requirement:

- New personal developer accounts generally need a closed test before production release.
- The current requirement includes at least 12 opted-in testers for 14 continuous days before applying for production access.
- Official source: https://support.google.com/googleplay/android-developer/answer/14151465

## Do You Need A Mac?

You do not need to buy a MacBook specifically, but iOS publishing requires access to macOS/Xcode or a cloud Mac build service.

Your wife owns a Mac, and that should be enough if you can use it for:

- Installing Xcode.
- Creating and managing iOS signing certificates.
- Building the iOS app.
- Testing with the iOS Simulator.
- Uploading builds to TestFlight and App Store Connect.

Your iPad and iPhones are useful for:

- Real-device testing.
- Apple Account two-factor authentication.
- Checking the app experience before submission.

They are not a full replacement for Xcode.

Windows machines are enough for:

- Normal FanVerdict web development.
- Android development with Android Studio.
- Google Play packaging and upload.

Official Xcode source: https://developer.apple.com/xcode/

## Recommended Technical Path

### Phase 1: Polish The Web App As A PWA

This should come first because it improves the existing FanVerdict experience immediately and prepares the app for store packaging.

Work items:

- Add a web app manifest.
- Add production app icons in required sizes.
- Add home-screen install behavior.
- Add mobile-safe layouts and navigation polish.
- Add loading states that feel good on mobile.
- Ensure sessions stay reliable on mobile browsers.
- Confirm the app works well from the iPhone and Android home screen.

This phase has no store fees.

### Phase 2: Package Android

Use a wrapper such as Capacitor to package the existing web app for Android.

Work items:

- Add Capacitor to the project.
- Configure Android app ID, app name, icons, and splash screen.
- Build an Android App Bundle, usually an `.aab`.
- Test on an Android phone, such as your son's Android device.
- Create Google Play Console listing.
- Run closed testing if required.
- Submit for production review after testing.

Android can be built from Windows.

### Phase 3: Package iOS

Use Capacitor for iOS as well, but the iOS build/sign/upload path needs a Mac.

Work items:

- Use wife’s Mac with Xcode installed.
- Configure iOS bundle ID, app name, icons, and splash screen.
- Build the app in Xcode.
- Test in Simulator.
- Test on real iPhones and iPad.
- Upload to TestFlight.
- Add external or internal testers.
- Submit to App Review.

## Important Apple Review Risk

Apple may reject apps that are simply repackaged websites. FanVerdict should feel useful and app-like, not just like a website inside a shell.

Apple App Review Guideline 4.2 says apps should include features, content, and UI that elevate them beyond a repackaged website.

Official source: https://developer.apple.com/app-store/review/guidelines/

For FanVerdict, good app-like features would include:

- Push notifications for poll reminders.
- Native sharing.
- Fast mobile navigation.
- Reliable saved login/session behavior.
- Notification preferences.
- Clear account/profile management.

Push notifications are especially valuable because they can reduce dependence on email reminders that may land in spam.

## Privacy And Account Requirements

FanVerdict has accounts, profiles, email reminders, votes, standings, and possibly phone/WhatsApp fields. Store submissions must disclose this accurately.

Apple requirements to prepare for:

- Privacy policy URL.
- Privacy policy link inside the app.
- App privacy details in App Store Connect.
- Account deletion inside the app if account creation is supported.
- Demo account or demo mode for App Review if login is required.
- Backend services must be live during review.

Apple App Review Guidelines source: https://developer.apple.com/app-store/review/guidelines/

Google requirements to prepare for:

- Privacy policy URL in Play Console.
- Privacy policy link or text inside the app.
- Data Safety form.
- Accurate disclosure of collected, used, shared, and retained user data.
- Account deletion request flow inside the app and outside the app.

Google User Data policy source: https://support.google.com/googleplay/android-developer/answer/10144311

Google Data Safety source: https://support.google.com/googleplay/android-developer/answer/10787469

## Store Submission Checklist

Before submitting to either store:

- App name finalized.
- App icon finalized.
- Splash screen assets finalized.
- Screenshots prepared for phone and tablet sizes.
- Short app description written.
- Full app description written.
- Support URL available.
- Privacy policy URL available.
- Account deletion flow implemented.
- Demo account ready for reviewers.
- Backend is live and reachable.
- Test users can vote, view standings, manage profile, and receive notifications.
- No test/placeholder content visible in production.
- No broken links.
- No crashes or blank screens.
- Email/push notification behavior documented.
- Privacy disclosures match actual app behavior.

## Practical Recommendation

Do not start by submitting to both stores immediately.

Start with:

1. PWA polish.
2. Push notification plan.
3. Account deletion and privacy policy readiness.
4. Android package and closed test.
5. iOS package using wife’s Mac after Android is stable.

This keeps the risk and cost controlled while moving FanVerdict toward real mobile app distribution.
