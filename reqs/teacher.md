# Teacher Dashboard Requirements Document

## Dashboard

- Show Cards each one clickable and redirect to the respective page
    - Total Quizzes
    - Total Students
    - Total Submissions
    - Total Classes

## Quiz Management Page

- Show all quizzes sorted by date desc
- Show Quizzes as cards each card has the quiz name, description and start and end dates, and status(open, ended, upcoming)
- Each card has 3 buttons
    - Show Details
    - Delete
    - View Submissions
- Button to create new quiz

## Quiz Creation Page

- Add Quiz Name
- Add Quiz Description
- Add Quiz Start Date
- Add Quiz End Date
- Add Quiz Duration
- Add Quiz Questions
    - Add Question
    - Add Options
    - Add Correct Option
    - Add Optional illustration Image
- Choose Classes to assign quiz to

## Quiz Details Page

- Show Quiz Details
- Show Quiz Questions
- Show Quiz Submissions Analysis(students in class vs students who submitted, average score, best score, worst score, average time taken, best time taken, worst time taken)
- Show Quiz Results
    - Show Quiz Results as cards each card has the student name, score with a button to show the submission details, button to send wa.me link to the student/parent with the results and show violations if exist
- Show Quiz Edit button if quiz is upcoming
- Show Quiz Delete button if quiz is upcoming
- Show Release Results button if quiz is ended
- Show Quiz Leaderboard if quiz is ended based on score and time taken

## Quiz Submission Details Page

- Show the Student's Answers
- Show the Correct Answers
- Show the Score
- Show the Time Taken
- Show the Date and Time of Submission

## Class Management Page

- Show all classes sorted alphabetically with a search function
- Show classes as cards each card has the class name, number of students
- Each card has 3 buttons
    - Show Details
    - Delete
- Button to create new class

## Class Details Page

- Show Class Details
- Show Class Students with a button to remove them
- Show Class Quizzes
- Show Class Edit button
- Show Class Delete button
- Show Add Students button with phone number

## Class Creation Page

- Add Class Name
- Add Class Description
- Add Class Students Optionally

## Student Details Page

- Show Student Details
- Show Student Quiz Attempts from that class/teacher
- Show Student Quiz Attempts Analysis(best score, worst score, average score)
