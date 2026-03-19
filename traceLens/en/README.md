# TraceLens
Java Stack Trace Analyzer

## Overview
Paste Java error logs to identify the location where the error occurs.

## Target Audience
- Java beginners
- Operations and maintenance personnel

## Features

### Exception Name
- If the log contains "Caused by...", the Exception name specified in the Caused by statement is displayed
- Note: When multiple Caused by statements exist, the last one is extracted and displayed

### Error Message
- Extracts and displays the Exception message from the error log

### Error Location (Class and Line Number)
- Identified from the "at ..." portion of the stack trace
- Note: Native Method or Unknown Source locations are not displayed
