package ai.hash.rustextra.projectView

import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiDirectoryNode
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.DumbAware
import com.intellij.psi.PsiFile

//import org.rust.lang.core.psi.RsFile

// The problem is, that we're getting _fucked_ in the second iteration, to not do that we need to have an opaque type (?)
// that is converted at a later date to the correct one
class ModuleGroupTreeStructureProvider : TreeStructureProvider, DumbAware {
    override fun modify(
        parent: AbstractTreeNode<*>,
        children: MutableCollection<AbstractTreeNode<*>>,
        settings: ViewSettings?
    ): MutableCollection<AbstractTreeNode<*>> {
        val nodes = ArrayList<AbstractTreeNode<*>>();

        val directories = HashMap<String, ModuleDirectoryNode>();

        for (child in children) {
            if (child is PsiDirectoryNode) {
                val file = child.virtualFile;

                if (file != null && file.isDirectory) {
                    directories[file.name] = ModuleDirectoryNode.fromPsiFileNode(child);
                }
            }
        }

        for (childRef in children) {
            var child = childRef;

            if (child is ModuleFileNode) {
                // the file has already been processed, therefore to not recurse endlessly we end prematurely
                nodes.add(child);
                continue;
            }

            val value = child.value;

            if (child !is ModuleFileNode && child is PsiFileNode && value is PsiFile && value.getUserData(ModuleFileNodeMarker) == true) {
                // always ensures that the file is actually ours
                child = ModuleFileNode.wrap(child, settings);
            }

            if (child is PsiFileNode && value is PsiFile && !value.isDirectory && value.fileType.name == "Rust") {
                if (value.getUserData(ModuleFileNodeRecursionMarker) == true) {
                    // we already processed the file, wrap in a proper node and continue
                    nodes.add(child);
                    value.putUserData(ModuleFileNodeRecursionMarker, false);

                    continue
                }

                val directory = directories[value.virtualFile.nameWithoutExtension];
                if (directory != null) {
                    // highlight the file
                    directory.addPrepend(ModuleFileNode.fromPsiFileNode(child, settings));

                    continue
                }
            }

            if (child is PsiDirectoryNode) {
                val file = child.virtualFile;

                if (file != null && file.isDirectory) {
                    val directory = directories[file.name];
                    if (directory != null) {
                        nodes.add(directory)
                    };
                }

                continue
            }

            nodes.add(child);
        }

        return nodes;
    }
}