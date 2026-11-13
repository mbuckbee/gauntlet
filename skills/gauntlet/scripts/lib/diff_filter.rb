# frozen_string_literal: true

# Used by ui-drift-rails (ui-drift-js uses the Node port, diff-filter.cjs; keep
# the two in step): parse `git diff -U0 base...head`
# and decide whether a lint finding is drift the diff INTRODUCED.
#
# "Introduced" means: on a line the diff added, and the drift string (the
# finding's value/snippet, whitespace-normalized) is not on a removed line of
# the same hunk, so a line rewritten for another reason doesn't carry its old
# drift into the PR. Lines the diff moved (removed verbatim elsewhere in the
# diff, e.g. markup extracted into a new partial) never count: that's old
# drift relocated, not written.

require "json"
require "open3"
require "set"

module UiDrift
  module_function

  def emit(obj)
    puts JSON.pretty_generate(obj)
    exit 0
  end

  # Literal pathspecs: Next.js route dirs like `app/[slug]/` are not globs.
  def git(repo, *args)
    out, status = Open3.capture2("git", "-C", repo, "--literal-pathspecs", "-c", "core.quotePath=false", *args)
    raise "git #{args.join(' ')} failed" unless status.success?
    out
  end

  def norm(str)
    str.to_s.gsub(/\s+/, " ").strip
  end

  # Extract `paths` (files or directories) of `ref` into `dir`.
  def export(repo, ref, paths, dir)
    statuses = Open3.pipeline(["git", "-C", repo, "--literal-pathspecs", "archive", ref, "--", *paths], ["tar", "-x", "-C", dir])
    raise "git archive | tar failed" unless statuses.all?(&:success?)
  end

  class DiffFilter
    attr_reader :range, :added_raw, :new_files

    # pathspecs: limit the diff (directories, globs or explicit files).
    def initialize(repo, base, head, pathspecs)
      @repo = repo
      @range = "#{base}...#{head}"
      @pathspecs = pathspecs
      @added = {}     # file => { line => hunk_id }
      @removed = {}   # hunk_id => [normalized removed lines]
      @added_raw = [] # every added line's text
      @added_text = {} # file => { line => normalized text }
      @new_files = UiDrift.git(repo, "diff", "--name-only", "--diff-filter=A", @range, "--", *pathspecs).split("\n")
      parse
    end

    def empty?
      @added.empty?
    end

    def added_files
      @added.keys
    end

    def added?(file, line)
      !hunk(file, line).nil?
    end

    # Added by this diff and not merely moved from elsewhere in it.
    def fresh?(file, line)
      added?(file, line) && !moved?(file, line)
    end

    # Removed (normalized) lines of the hunk that added file:line; nil when
    # the diff didn't add that line.
    def removed_near(file, line)
      h = hunk(file, line) or return nil
      @removed.fetch(h, [])
    end

    def all_removed
      @removed.values.flatten
    end

    # file:line's added text was removed elsewhere in the diff verbatim, as
    # part of a block: code moved between files or hunks, not written by this
    # diff. A neighbouring added line must match too, so a lone generic line
    # (`<button type="button"`) removed somewhere by coincidence doesn't hide
    # genuinely new drift.
    def moved?(file, line)
      removed_verbatim?(file, line) &&
        [-1, 1].any? { |dir| (n = neighbour(file, line, dir)) && removed_verbatim?(file, n) }
    end

    def introduced?(file, line, token)
      return false unless fresh?(file, line)
      removed = removed_near(file, line)
      t = UiDrift.norm(token)
      t.empty? || removed.none? { |r| r.include?(t) }
    end

    # Keep findings (hashes with "file"/"line") the diff introduced. The drift
    # string is finding[token_key], else finding["snippet"].
    def filter(findings, token_key: "token")
      findings.select { |f| introduced?(f["file"], f["line"], f[token_key] || f["snippet"]) }
    end

    private

    # Nearest added line above/below that isn't blank, within 3 lines.
    def neighbour(file, line, dir)
      (1..3).each do |step|
        text = @added_text.dig(file, line + dir * step)
        return nil if text.nil?
        return line + dir * step unless text.empty?
      end
      nil
    end

    def removed_verbatim?(file, line)
      text = @added_text.dig(file, line)
      return false if text.nil? || text.empty?
      (@removed_set ||= all_removed.to_set).include?(text)
    end

    def hunk(file, line)
      @added.dig(file, line)
    end

    # Header lines (---/+++) only appear between `diff --git` and the first
    # @@, so track that instead of guessing from a line's leading characters:
    # a removed CSS line `--brand: #fff` arrives as `---brand: #fff`.
    def parse
      file = nil
      hunk = 0
      lineno = 0
      in_header = false
      UiDrift.git(@repo, "diff", "-U0", "--no-color", "--no-ext-diff", @range, "--", *@pathspecs).each_line do |l|
        if l.start_with?("diff --git ")
          in_header = true
          file = nil
          next
        end
        if in_header
          if l.start_with?("@@")
            in_header = false
          else
            file = l[6..].chomp if l.start_with?("+++ b/")
            next
          end
        end
        case l
        when /\A@@ -\d+(?:,\d+)? \+(\d+)/
          hunk += 1
          lineno = Regexp.last_match(1).to_i
        when /\A-/ then (@removed[hunk] ||= []) << UiDrift.norm(l[1..])
        when /\A\+/
          if file
            (@added[file] ||= {})[lineno] = hunk
            (@added_text[file] ||= {})[lineno] = UiDrift.norm(l[1..])
          end
          @added_raw << l[1..]
          lineno += 1
        end
      end
    end
  end
end
